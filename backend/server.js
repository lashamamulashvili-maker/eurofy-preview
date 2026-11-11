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
// Restrict browser origins; no wildcard CORS for authenticated endpoints.
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
app.use('/api',(req,res,next)=>{
 const origin=req.get('origin');
 if(origin&&!allowedOrigins.has(origin))return res.status(403).json({error:'Origin not allowed'});
 if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.set('Access-Control-Allow-Headers','Authorization,Content-Type');}
 if(req.method==='OPTIONS')return res.status(204).end();
 next();
});
const pool = process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='require'?{rejectUnauthorized:true}:undefined}) : null;
app.get('/api/health',(_req,res)=>res.json({ok:true,databaseConfigured:Boolean(pool)}));
app.get('/api/products',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{
  const {rows}=await pool.query('SELECT p.id,p.title_ka,p.description_ka,p.price_gel_minor,p.original_price_gel_minor,p.image_url,c.name_ka AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.is_active=true ORDER BY p.created_at DESC LIMIT 100');
  res.json({products:rows});
 }catch{res.status(500).json({error:'Unable to load products'});}
});
const registerLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/register',registerLimit,async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const {email,password,fullName,phone,address,city}=req.body||{};
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||typeof fullName!=='string'||fullName.trim().length<2||fullName.length>120||typeof phone!=='string'||!/^\+?[0-9 ()-]{7,24}$/.test(phone.trim())||typeof address!=='string'||address.trim().length<5||address.length>300||typeof city!=='string'||city.trim().length<2||city.length>120)return res.status(400).json({error:'Invalid registration fields'});
 try{
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(email,password_hash,full_name,phone,address,city) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,full_name',[email.trim().toLowerCase(),hash,fullName.trim(),phone.trim(),address.trim(),city.trim()]);
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
 if(!emailValid(email)||typeof password!=='string'||password.length<1||password.length>128)return res.status(400).json({error:'Invalid credentials'});
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
 let client;
 try{
  client=await pool.connect();
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
 }catch{if(client)await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Order could not be created'});}
 finally{if(client)client.release();}
});
app.get('/api/admin/orders',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query('SELECT id,order_number,status,payment_status,total_gel_minor,created_at FROM orders ORDER BY created_at DESC LIMIT 100');res.json({orders:rows});}
 catch{res.status(500).json({error:'Unable to load orders'});}
});
const safeText=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const minor=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000;
const percent=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=500;
async function calculate(client,cost,categoryId,override,fixed){
 if(fixed!==null)return fixed;
 if(cost===null)return null;
 const {rows}=await client.query('SELECT s.default_markup_percent,s.shipping_gel_minor,c.markup_percent FROM pricing_settings s LEFT JOIN category_markups c ON c.category_id=$1 WHERE s.id=1',[categoryId]);
 if(!rows.length)throw Error('Pricing settings missing');
 const p=override??Number(rows[0].markup_percent??rows[0].default_markup_percent);
 const n=Math.round((cost+rows[0].shipping_gel_minor)*(1+p/100));
 if(!minor(n))throw Error('Price out of range');return n;
}
app.get('/api/admin/pricing',auth,admin,async(_req,res)=>{try{const [s,c]=await Promise.all([pool.query('SELECT * FROM pricing_settings WHERE id=1'),pool.query('SELECT * FROM category_markups')]);res.json({settings:s.rows[0],categoryMarkups:c.rows});}catch{res.status(500).json({error:'Apply pricing migration first'});}});
app.put('/api/admin/pricing',auth,admin,async(req,res)=>{
 const {markup,shippingMinor,categories}=req.body||{};
 if(!percent(markup)||!minor(shippingMinor)||!Array.isArray(categories)||categories.length>100||categories.some(x=>!uuid(x.id)||!percent(x.markup))||new Set(categories.map(x=>x.id)).size!==categories.length)return res.status(400).json({error:'Invalid pricing rules'});
 let c;try{c=await pool.connect();await c.query('BEGIN');await c.query('UPDATE pricing_settings SET default_markup_percent=$1,shipping_gel_minor=$2 WHERE id=1',[markup,shippingMinor]);await c.query('DELETE FROM category_markups');for(const x of categories)await c.query('INSERT INTO category_markups(category_id,markup_percent) VALUES($1,$2)',[x.id,x.markup]);await c.query('COMMIT');res.json({saved:true});}catch{await c?.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Could not save rules'});}finally{c?.release();}
});
app.post('/api/admin/pricing/recalculate',auth,admin,async(_req,res)=>{
 let c;try{c=await pool.connect();await c.query('BEGIN');const {rows}=await c.query('SELECT * FROM products WHERE supplier_price_gel_minor IS NOT NULL FOR UPDATE');for(const p of rows){const override=p.markup_override_percent===null?null:Number(p.markup_override_percent);const price=await calculate(c,p.supplier_price_gel_minor,p.category_id,override,p.fixed_price_gel_minor);const old=p.discount_verified&&p.supplier_original_gel_minor>p.supplier_price_gel_minor?await calculate(c,p.supplier_original_gel_minor,p.category_id,override,null):null;await c.query('UPDATE products SET price_gel_minor=$1,original_price_gel_minor=$2 WHERE id=$3',[price,old>price?old:null,p.id]);}await c.query('COMMIT');res.json({updated:rows.length});}catch{await c?.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Recalculation failed'});}finally{c?.release();}
});
app.get('/api/admin/products',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query('SELECT id,category_id,title_ka,description_ka,price_gel_minor,original_price_gel_minor,supplier_price_gel_minor,supplier_original_gel_minor,markup_override_percent,fixed_price_gel_minor,discount_verified,image_url,sku,is_active,created_at FROM products ORDER BY created_at DESC LIMIT 200');res.json({products:rows});}
 catch{res.status(500).json({error:'Unable to load products'});}
});
app.post('/api/admin/products',auth,admin,async(req,res)=>{
 const {title,description='',priceMinor,categoryId=null,imageUrl=null,sku=null,active=false,supplierPriceMinor=null,supplierOriginalMinor=null,markupOverride=null,fixedPriceMinor=null,discountVerified=false}=req.body||{};
 if(!safeText(title,180)||typeof description!=='string'||description.length>5000||!minor(priceMinor)||categoryId!==null&&!uuid(categoryId)||imageUrl!==null&&(typeof imageUrl!=='string'||imageUrl.length>1000||!/^https:\/\//.test(imageUrl))||sku!==null&&!safeText(sku,80)||typeof active!=='boolean'||supplierPriceMinor!==null&&!minor(supplierPriceMinor)||supplierOriginalMinor!==null&&!minor(supplierOriginalMinor)||markupOverride!==null&&!percent(markupOverride)||fixedPriceMinor!==null&&!minor(fixedPriceMinor)||typeof discountVerified!=='boolean')return res.status(400).json({error:'Invalid product'});
 try{const price=(await calculate(pool,supplierPriceMinor,categoryId,markupOverride,fixedPriceMinor))??priceMinor;const original=discountVerified&&supplierOriginalMinor>supplierPriceMinor&&supplierPriceMinor!==null?await calculate(pool,supplierOriginalMinor,categoryId,markupOverride,null):null;const {rows}=await pool.query('INSERT INTO products(title_ka,description_ka,price_gel_minor,original_price_gel_minor,category_id,image_url,sku,is_active,supplier_price_gel_minor,supplier_original_gel_minor,markup_override_percent,fixed_price_gel_minor,discount_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[title.trim(),description,price,original>price?original:null,categoryId,imageUrl,sku,active,supplierPriceMinor,supplierOriginalMinor,markupOverride,fixedPriceMinor,discountVerified]);res.status(201).json({product:rows[0]});}catch(e){res.status(e.code==='23505'?409:500).json({error:'Product creation failed; check pricing migration'});}
});
app.patch('/api/admin/products/:id',auth,admin,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid id'});
 const map={title:'title_ka',description:'description_ka',priceMinor:'price_gel_minor',categoryId:'category_id',imageUrl:'image_url',sku:'sku',active:'is_active',supplierPriceMinor:'supplier_price_gel_minor',supplierOriginalMinor:'supplier_original_gel_minor',markupOverride:'markup_override_percent',fixedPriceMinor:'fixed_price_gel_minor',discountVerified:'discount_verified'};
 const v=req.body||{},keys=Object.keys(v);if(!keys.length||keys.some(k=>!map[k]))return res.status(400).json({error:'Invalid fields'});
 for(const k of keys){const x=v[k];if(!(k==='title'?safeText(x,180):k==='description'?typeof x==='string'&&x.length<=5000:k==='priceMinor'||k==='supplierPriceMinor'||k==='supplierOriginalMinor'||k==='fixedPriceMinor'?x===null&&k!=='priceMinor'||minor(x):k==='categoryId'?x===null||uuid(x):k==='imageUrl'?x===null||typeof x==='string'&&x.length<=1000&&/^https:\/\//.test(x):k==='sku'?x===null||safeText(x,80):k==='markupOverride'?x===null||percent(x):typeof x==='boolean'))return res.status(400).json({error:'Invalid '+k});}
 let c;try{c=await pool.connect();await c.query('BEGIN');const existing=await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[req.params.id]);if(!existing.rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Not found'});}const fields=keys.map((k,i)=>map[k]+'=$'+(i+1));await c.query('UPDATE products SET '+fields.join(',')+' WHERE id=$'+(keys.length+1),[...keys.map(k=>v[k]),req.params.id]);const row=(await c.query('SELECT * FROM products WHERE id=$1',[req.params.id])).rows[0];if(keys.some(k=>['supplierPriceMinor','supplierOriginalMinor','markupOverride','fixedPriceMinor','categoryId','discountVerified'].includes(k))){const override=row.markup_override_percent===null?null:Number(row.markup_override_percent);const price=await calculate(c,row.supplier_price_gel_minor,row.category_id,override,row.fixed_price_gel_minor);if(price!==null){const old=row.discount_verified&&row.supplier_original_gel_minor>row.supplier_price_gel_minor?await calculate(c,row.supplier_original_gel_minor,row.category_id,override,null):null;await c.query('UPDATE products SET price_gel_minor=$1,original_price_gel_minor=$2 WHERE id=$3',[price,old>price?old:null,row.id]);}}const result=(await c.query('SELECT * FROM products WHERE id=$1',[req.params.id])).rows[0];await c.query('COMMIT');res.json({product:result});}catch{await c?.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Update failed'});}finally{c?.release();}
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
