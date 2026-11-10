import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
const pool = process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='require'?{rejectUnauthorized:true}:undefined}) : null;
app.get('/api/health',(_req,res)=>res.json({ok:true,databaseConfigured:Boolean(pool)}));
app.get('/api/products',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{
  const {rows}=await pool.query('SELECT p.id,p.title_ka,p.description_ka,p.price_gel_minor,p.image_url,c.name_ka AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.is_active=true ORDER BY p.created_at DESC LIMIT 100');
  res.json({products:rows});
 }catch{res.status(500).json({error:'Unable to load products'});}
});
app.post('/api/register',async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const {email,password,fullName}=req.body||{};
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||typeof fullName!=='string'||fullName.length>120)return res.status(400).json({error:'Invalid registration fields'});
 try{
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id,email,full_name',[email.trim().toLowerCase(),hash,fullName.trim()]);
  res.status(201).json({user:rows[0]});
 }catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Email already registered':'Registration failed'});}
});

// Authentication is via bearer tokens, never via a URL or browser localStorage.
// This API is not publicly deployed; production deployment needs HTTPS and an audited client.
const tokenHash=t=>createHash('sha256').update(t).digest('hex');
const emailValid=e=>typeof e==='string'&&e.length<=254&&/^\S+@\S+\.\S+$/.test(e);
async function auth(req,res,next){
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const match=/^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization')||'');
 if(!match)return res.status(401).json({error:'Authentication required'});
 try{
  const {rows}=await pool.query('SELECT u.id,u.email,u.full_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[tokenHash(match[1])]);
  if(!rows.length)return res.status(401).json({error:'Invalid or expired session'});
  req.user=rows[0];req.sessionHash=tokenHash(match[1]);next();
 }catch{res.status(500).json({error:'Authentication unavailable'});}
}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Forbidden'});next();}
const loginLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/login',loginLimit,async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const {email,password}=req.body||{};
 if(!emailValid(email)||typeof password!=='string'||password.length>128)return res.status(400).json({error:'Invalid credentials'});
 try{
  const {rows}=await pool.query('SELECT id,email,full_name,role,password_hash FROM users WHERE email=$1',[email.trim().toLowerCase()]);
  const ok=rows.length?await bcrypt.compare(password,rows[0].password_hash):await bcrypt.compare(password,'$2a$12$0OLvD1D8Kp85C3hjLcfZMeHL9iK2SmT2Q7pIO2Z2HJ5Wb9xznWw4O');
  if(!ok)return res.status(401).json({error:'Invalid credentials'});
  const token=randomBytes(32).toString('hex');
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[rows[0].id,tokenHash(token)]);
  const {password_hash,...user}=rows[0];
  res.set('Cache-Control','no-store').json({token,user,expiresInSeconds:604800});
 }catch{res.status(500).json({error:'Login unavailable'});}
});
app.get('/api/me',auth,(req,res)=>res.set('Cache-Control','no-store').json({user:req.user}));
app.post('/api/logout',auth,async(req,res)=>{
 try{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.status(204).end();}
 catch{res.status(500).json({error:'Logout failed'});}
});
app.get('/api/my-orders',auth,async(req,res)=>{
 try{const {rows}=await pool.query('SELECT id,order_number,status,payment_status,total_gel_minor,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);res.json({orders:rows});}
 catch{res.status(500).json({error:'Unable to load orders'});}
});
// Orders remain unpaid until a separately integrated payment provider verifies payment.
app.post('/api/orders',auth,async(req,res)=>{
 const {items,deliveryName,deliveryPhone,deliveryAddress}=req.body||{};
 if(!Array.isArray(items)||items.length<1||items.length>40||items.some(i=>!i||typeof i.productId!=='string'||!/^[0-9a-f-]{36}$/i.test(i.productId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20)||typeof deliveryName!=='string'||deliveryName.trim().length<2||deliveryName.length>120||typeof deliveryPhone!=='string'||deliveryPhone.length<5||deliveryPhone.length>40||typeof deliveryAddress!=='string'||deliveryAddress.trim().length<8||deliveryAddress.length>500)return res.status(400).json({error:'Invalid order fields'});
 const ids=items.map(i=>i.productId);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'Duplicate products'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const {rows}=await client.query('SELECT id,title_ka,price_gel_minor FROM products WHERE is_active=true AND id=ANY($1::uuid[])',[ids]);
  if(rows.length!==items.length){await client.query('ROLLBACK');return res.status(409).json({error:'Products unavailable'});}
  const byId=new Map(rows.map(p=>[p.id,p]));
  const total=items.reduce((n,i)=>n+byId.get(i.productId).price_gel_minor*i.quantity,0);
  if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid total');
  const number='EF-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(4).toString('hex').toUpperCase();
  const {rows:created}=await client.query('INSERT INTO orders(order_number,user_id,total_gel_minor,delivery_name,delivery_phone,delivery_address) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,order_number,status,payment_status,total_gel_minor',[number,req.user.id,total,deliveryName.trim(),deliveryPhone.trim(),deliveryAddress.trim()]);
  for(const i of items){const p=byId.get(i.productId);await client.query('INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,$3,$4,$5)',[created[0].id,p.id,p.title_ka,p.price_gel_minor,i.quantity]);}
  await client.query('COMMIT');
  res.status(201).json({order:created[0],notice:'Order is unpaid. No purchase or shipment has been initiated.'});
 }catch{await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Order could not be created'});}
 finally{client.release();}
});
app.get('/api/admin/orders',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query('SELECT id,order_number,status,payment_status,total_gel_minor,created_at FROM orders ORDER BY created_at DESC LIMIT 100');res.json({orders:rows});}
 catch{res.status(500).json({error:'Unable to load orders'});}
});

const safeText=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
app.get('/api/admin/products',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query('SELECT id,category_id,title_ka,description_ka,price_gel_minor,image_url,sku,is_active,created_at FROM products ORDER BY created_at DESC LIMIT 200');res.json({products:rows});}
 catch{res.status(500).json({error:'Unable to load products'});}
});
app.post('/api/admin/products',auth,admin,async(req,res)=>{
 const {title,description='',priceMinor,categoryId=null,imageUrl=null,sku=null,active=false}=req.body||{};
 if(!safeText(title,180)||typeof description!=='string'||description.length>5000||!Number.isSafeInteger(priceMinor)||priceMinor<0||priceMinor>100000000||categoryId!==null&&!uuid(categoryId)||imageUrl!==null&&(typeof imageUrl!=='string'||imageUrl.length>1000||!/^https:\/\//.test(imageUrl))||sku!==null&&!safeText(sku,80)||typeof active!=='boolean')return res.status(400).json({error:'Invalid product'});
 try{const {rows}=await pool.query('INSERT INTO products(title_ka,description_ka,price_gel_minor,category_id,image_url,sku,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[title.trim(),description,priceMinor,categoryId,imageUrl,sku,active]);res.status(201).json({product:rows[0]});}
 catch(e){res.status(e.code==='23505'?409:500).json({error:'Product could not be created'});}
});
app.patch('/api/admin/products/:id',auth,admin,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid id'});
 const allowed={title_ka:'title',description_ka:'description',price_gel_minor:'priceMinor',category_id:'categoryId',image_url:'imageUrl',sku:'sku',is_active:'active'};
 const fields=[];const values=[];
 for(const [column,key] of Object.entries(allowed))if(Object.hasOwn(req.body||{},key)){
  const v=req.body[key];
  const valid=key==='title'?safeText(v,180):key==='description'?typeof v==='string'&&v.length<=5000:key==='priceMinor'?Number.isSafeInteger(v)&&v>=0&&v<=100000000:key==='categoryId'?v===null||uuid(v):key==='imageUrl'?v===null||typeof v==='string'&&v.length<=1000&&/^https:\/\//.test(v):key==='sku'?v===null||safeText(v,80):typeof v==='boolean';
  if(!valid)return res.status(400).json({error:'Invalid '+key});
  values.push(key==='title'?v.trim():v);fields.push(column+'=
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log('EUROFY API listening on '+port));
+values.length);
 }
 if(!fields.length)return res.status(400).json({error:'No fields'});
 values.push(req.params.id);
 try{const {rows}=await pool.query('UPDATE products SET '+fields.join(',')+' WHERE id=
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log('EUROFY API listening on '+port));
+values.length+' RETURNING *',values);if(!rows.length)return res.status(404).json({error:'Not found'});res.json({product:rows[0]});}
 catch{res.status(500).json({error:'Product could not be updated'});}
});
app.get('/api/categories',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{const {rows}=await pool.query('SELECT id,name_ka,slug FROM categories ORDER BY name_ka');res.json({categories:rows});}
 catch{res.status(500).json({error:'Unable to load categories'});}
});
app.post('/api/admin/categories',auth,admin,async(req,res)=>{
 const {name,slug}=req.body||{};
 if(!safeText(name,100)||!safeText(slug,100)||!/^[a-z0-9-]+$/.test(slug))return res.status(400).json({error:'Invalid category'});
 try{const {rows}=await pool.query('INSERT INTO categories(name_ka,slug) VALUES($1,$2) RETURNING *',[name.trim(),slug]);res.status(201).json({category:rows[0]});}
 catch(e){res.status(e.code==='23505'?409:500).json({error:'Category could not be created'});}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log('EUROFY API listening on '+port));
