import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openLocalPglite} from './local-database.js';
import {getPersistentCart,listStoreProducts,setPersistentCartItem} from './storefront-repository.js';
import {createOrderFulfillment,transitionOrderFulfillment} from './fulfillment-repository.js';

const app = express();
// Render terminates HTTPS at its reverse proxy. Trust only the nearest proxy hop
// so express-rate-limit can resolve the client IP from X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
// Restrict browser origins; no wildcard CORS for authenticated endpoints.
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
app.use('/api',(req,res,next)=>{
 const origin=req.get('origin');
 const localStoreOrigin=process.env.EUROFY_SERVE_STORE==='1'&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin||'')&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.get('host')||'');
 if(origin&&!allowedOrigins.has(origin)&&!localStoreOrigin)return res.status(403).json({error:'Origin not allowed'});
 if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,OPTIONS');res.set('Access-Control-Allow-Headers','Authorization,Content-Type');}
 if(req.method==='OPTIONS')return res.status(204).end();
 next();
});
// Official indicative EUR/GEL rate. Never silently use an old or invented rate.
let fxCache=null;
async function eurGelRate(){
 if(fxCache&&Date.now()-fxCache.fetchedAt<6*60*60*1000)return fxCache;
 const response=await fetch('https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=EUR',{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('NBG exchange rate unavailable');
 const data=await response.json();const entry=data?.[0]?.currencies?.find(c=>c.code==='EUR');const rate=Number(entry?.rate)/Number(entry?.quantity||1);
 if(!Number.isFinite(rate)||rate<0.5||rate>10||!/^\\d{4}-\\d{2}-\\d{2}$/.test(data?.[0]?.date||''))throw Error('Invalid NBG EUR rate');
 const age=(Date.now()-Date.parse(data[0].date+'T00:00:00Z'))/86400000;
 if(age>5||age< -2)throw Error('NBG rate is stale');
 fxCache={rate,date:data[0].date,source:'National Bank of Georgia',fetchedAt:Date.now()};return fxCache;
}
app.get('/api/exchange-rate',async(_req,res)=>{try{const {rate,date,source}=await eurGelRate();res.json({base:'EUR',quote:'GEL',rate,date,source,indicative:true});}catch{res.status(503).json({error:'Official exchange rate unavailable'});}});
const pool = process.env.EUROFY_DATABASE_MODE==='pglite'
 ? await openLocalPglite()
 : process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='require'?{rejectUnauthorized:true}:undefined}) : null;
app.get('/api/health',async(_req,res)=>{
 if(!pool)return res.json({ok:true,databaseConfigured:false,databaseConnected:false});
 try{await pool.query('SELECT 1');res.json({ok:true,databaseConfigured:true,databaseConnected:true});}
 catch(e){console.error('Database connectivity check failed:',{code:e.code||'UNKNOWN',message:e.message});res.status(503).json({ok:false,databaseConfigured:true,databaseConnected:false});}
});
app.get('/api/products',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{const rows=await listStoreProducts(pool,{search:typeof _req.query.q==='string'?_req.query.q:'',category:typeof _req.query.category==='string'?_req.query.category:'',limit:60});res.set('Cache-Control','no-store').json({products:rows});}
 catch(e){console.error('Product catalog query failed:',{code:e.code||'UNKNOWN',message:e.message});res.status(e.code==='42P01'||e.code==='42703'?503:400).json({error:e.code==='42P01'||e.code==='42703'?'Verified catalog migration required':'Unable to load products'});}
});
const registerLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/register',registerLimit,async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const {email,password,fullName,phone,address,city}=req.body||{};
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||typeof fullName!=='string'||fullName.trim().length<2||fullName.length>120||typeof phone!=='string'||!/^\+?[0-9 ()-]{7,24}$/.test(phone.trim())||typeof address!=='string'||address.trim().length<5||address.length>300||typeof city!=='string'||city.trim().length<2||city.length>120)return res.status(400).json({error:'Invalid registration fields'});
 try{
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(email,password_hash,full_name,phone,address,city) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,full_name,customer_code',[email.trim().toLowerCase(),hash,fullName.trim(),phone.trim(),address.trim(),city.trim()]);
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
  const {rows}=await pool.query('SELECT u.id,u.email,u.full_name,u.role,u.customer_code FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[tokenHash(match[1])]);
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
  const {rows}=await pool.query('SELECT id,email,full_name,role,customer_code,password_hash FROM users WHERE email=$1',[email.trim().toLowerCase()]);
  const ok=rows.length?await bcrypt.compare(password,rows[0].password_hash):await bcrypt.compare(password,'$2a$12$0OLvD1D8Kp85C3hjLcfZMeHL9iK2SmT2Q7pIO2Z2HJ5Wb9xznWw4O');
  if(!ok)return res.status(401).json({error:'Invalid credentials'});
  const token=randomBytes(32).toString('hex');
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[rows[0].id,tokenHash(token)]);
  const {password_hash,...user}=rows[0];
  res.set('Cache-Control','no-store').json({token,user,expiresInSeconds:604800});
 }catch{res.status(500).json({error:'Login unavailable'});}
});
app.get('/api/me',auth,(req,res)=>res.set('Cache-Control','no-store').json({user:req.user}));
app.get('/api/cart',auth,async(req,res)=>{
 try{const items=await getPersistentCart(pool,req.user.id);res.set('Cache-Control','no-store').json({items});}
 catch(e){console.error('Persistent cart read failed:',{code:e.code||'UNKNOWN',message:e.message});res.status(503).json({error:'Persistent cart is unavailable; apply local migrations'});}
});
app.put('/api/cart/items/:productId',auth,async(req,res)=>{
 const quantity=req.body?.quantity;
 if(!uuid(req.params.productId)||!Number.isInteger(quantity)||quantity<0||quantity>20)return res.status(400).json({error:'Quantity must be an integer from 0 to 20'});
 try{const item=await setPersistentCartItem(pool,{userId:req.user.id,productId:req.params.productId,quantity});res.set('Cache-Control','no-store').json({item});}
 catch(e){const unavailable=['PRODUCT_UNAVAILABLE','STOCK_UNAVAILABLE'].includes(e.code);res.status(unavailable?409:e instanceof TypeError?400:503).json({error:unavailable?e.message:'Persistent cart update failed'});}
});
app.get('/api/profile',auth,async(req,res)=>{
 try{const {rows}=await pool.query('SELECT id,email,full_name,phone,address,city,customer_code FROM users WHERE id=$1',[req.user.id]);if(!rows.length)return res.status(404).json({error:'Profile not found'});res.set('Cache-Control','no-store').json({profile:rows[0]});}
 catch{res.status(500).json({error:'Unable to load profile'});}
});
app.patch('/api/profile',auth,async(req,res)=>{
 const {fullName,phone,address,city}=req.body||{};
 if(typeof fullName!=='string'||fullName.trim().length<2||fullName.length>120||typeof phone!=='string'||!/^[+0-9 ()-]{7,24}$/.test(phone.trim())||typeof address!=='string'||address.trim().length<5||address.length>300||typeof city!=='string'||city.trim().length<2||city.length>120)return res.status(400).json({error:'Invalid profile fields'});
 try{const {rows}=await pool.query('UPDATE users SET full_name=$2,phone=$3,address=$4,city=$5 WHERE id=$1 RETURNING id,email,full_name,phone,address,city,customer_code',[req.user.id,fullName.trim(),phone.trim(),address.trim(),city.trim()]);res.set('Cache-Control','no-store').json({profile:rows[0]});}
 catch{res.status(500).json({error:'Unable to update profile'});}
});
// Customer address book is limited to Georgian delivery destinations for this market.
app.get('/api/addresses',auth,async(req,res)=>{
 try{const {rows}=await pool.query('SELECT id,label,recipient_name,phone,address_line1,address_line2,city,postal_code,country_code,is_default,created_at FROM eurofy_customer_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC',[req.user.id]);res.set('Cache-Control','no-store').json({addresses:rows});}
 catch{res.status(503).json({error:'Address book migration is required'});}
});
app.post('/api/addresses',auth,async(req,res)=>{
 const {label='Home',recipientName,phone,addressLine1,addressLine2='',city,postalCode='',isDefault=false}=req.body||{};
 if(!safeText(label,60)||!safeText(recipientName,120)||typeof phone!=='string'||!/^\+?[0-9 ()-]{7,24}$/.test(phone.trim())||!safeText(addressLine1,240)||typeof addressLine2!=='string'||addressLine2.length>240||!safeText(city,120)||typeof postalCode!=='string'||postalCode.length>32||typeof isDefault!=='boolean')return res.status(400).json({error:'Invalid Georgian delivery address'});
 let c;try{c=await pool.connect();await c.query('BEGIN');if(isDefault)await c.query('UPDATE eurofy_customer_addresses SET is_default=false,updated_at=now() WHERE user_id=$1',[req.user.id]);const {rows}=await c.query("INSERT INTO eurofy_customer_addresses(user_id,label,recipient_name,phone,address_line1,address_line2,city,postal_code,country_code,is_default) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'GE',$9) RETURNING *",[req.user.id,label.trim(),recipientName.trim(),phone.trim(),addressLine1.trim(),addressLine2.trim(),city.trim(),postalCode.trim(),isDefault]);await c.query('COMMIT');res.status(201).json({address:rows[0]});}catch{await c?.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Unable to save address'});}finally{c?.release();}
});
app.patch('/api/addresses/:id',auth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid address id'});const v=req.body||{},allowed=new Set(['label','recipientName','phone','addressLine1','addressLine2','city','postalCode','isDefault']),keys=Object.keys(v);if(!keys.length||keys.some(k=>!allowed.has(k)))return res.status(400).json({error:'Invalid address fields'});
 const checks={label:x=>safeText(x,60),recipientName:x=>safeText(x,120),phone:x=>typeof x==='string'&&/^\+?[0-9 ()-]{7,24}$/.test(x.trim()),addressLine1:x=>safeText(x,240),addressLine2:x=>typeof x==='string'&&x.length<=240,city:x=>safeText(x,120),postalCode:x=>typeof x==='string'&&x.length<=32,isDefault:x=>typeof x==='boolean'};if(keys.some(k=>!checks[k](v[k])))return res.status(400).json({error:'Invalid address fields'});
 const columns={label:'label',recipientName:'recipient_name',phone:'phone',addressLine1:'address_line1',addressLine2:'address_line2',city:'city',postalCode:'postal_code',isDefault:'is_default'};let c;try{c=await pool.connect();await c.query('BEGIN');const current=(await c.query('SELECT id FROM eurofy_customer_addresses WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!current){await c.query('ROLLBACK');return res.status(404).json({error:'Address not found'});}if(v.isDefault===true)await c.query('UPDATE eurofy_customer_addresses SET is_default=false,updated_at=now() WHERE user_id=$1',[req.user.id]);const assignments=keys.map((k,i)=>`${columns[k]}=$${i+1}`);const values=keys.map(k=>typeof v[k]==='string'?v[k].trim():v[k]);const {rows}=await c.query(`UPDATE eurofy_customer_addresses SET ${assignments.join(',')},updated_at=now() WHERE id=$${keys.length+1} RETURNING *`,[...values,req.params.id]);await c.query('COMMIT');res.json({address:rows[0]});}catch{await c?.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Unable to update address'});}finally{c?.release();}
});
app.delete('/api/addresses/:id',auth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid address id'});
 try{const out=await pool.query('DELETE FROM eurofy_customer_addresses WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.id]);if(!out.rowCount)return res.status(404).json({error:'Address not found'});res.status(204).end();}catch{res.status(503).json({error:'Unable to remove address'});}
});
app.post('/api/logout',auth,async(req,res)=>{
 try{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.status(204).end();}
 catch{res.status(500).json({error:'Logout failed'});}
});
app.get('/api/my-orders',auth,async(req,res)=>{
 try{const {rows}=await pool.query('SELECT id,order_number,status,payment_status,total_gel_minor,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);res.json({orders:rows});}
 catch{res.status(500).json({error:'Unable to load orders'});}
});
app.get('/api/my-orders/:id',auth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid order id'});
 try{const order=(await pool.query('SELECT id,order_number,status,payment_status,payment_mode,total_gel_minor,delivery_name,delivery_phone,delivery_address,created_at FROM orders WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id])).rows[0];if(!order)return res.status(404).json({error:'Order not found'});const items=(await pool.query('SELECT product_title_snapshot,unit_price_gel_minor,quantity FROM order_items WHERE order_id=$1 ORDER BY id',[order.id])).rows;const fulfillments=(await pool.query('SELECT f.id,f.fulfillment_model,f.status,f.destination_country,f.eu_receiving_country,f.created_at,p.package_reference,p.received_at,p.customs_document_status FROM eurofy_order_fulfillments f LEFT JOIN eurofy_forwarding_packages p ON p.fulfillment_id=f.id WHERE f.order_id=$1 ORDER BY f.created_at',[order.id])).rows;const shipments=fulfillments.length?(await pool.query('SELECT s.id,s.fulfillment_id,s.leg_type,s.carrier,s.tracking_number,s.status,COALESCE(json_agg(json_build_object(\'status\',e.status,\'description\',e.description,\'location\',e.location,\'occurred_at\',e.occurred_at,\'source\',e.source) ORDER BY e.occurred_at) FILTER(WHERE e.id IS NOT NULL),\'[]\') AS events FROM eurofy_fulfillment_shipments s LEFT JOIN eurofy_shipment_events e ON e.shipment_id=s.id WHERE s.fulfillment_id=ANY($1::uuid[]) GROUP BY s.id ORDER BY s.created_at',[fulfillments.map(x=>x.id)])).rows:[];res.set('Cache-Control','no-store').json({order,items,fulfillments,shipments});}
 catch{res.status(503).json({error:'Order detail is unavailable'});}
});
// Explicitly local-only mock payment. No card data or external payment provider is accepted.
app.post('/api/my-orders/:id/mock-payment',auth,async(req,res)=>{
 if(process.env.EUROFY_DATABASE_MODE!=='pglite')return res.status(403).json({error:'Mock payment is available only in the local PGlite development database'});
 if(!uuid(req.params.id)||!safeText(req.get('idempotency-key'),200))return res.status(400).json({error:'A valid order id and idempotency key are required'});
 let c;try{c=await pool.connect();await c.query('BEGIN');const order=(await c.query('SELECT id,total_gel_minor,payment_status FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!order){await c.query('ROLLBACK');return res.status(404).json({error:'Order not found'});}if(order.payment_status==='paid'){const prior=(await c.query('SELECT id,idempotency_key FROM eurofy_mock_payment_evidence WHERE order_id=$1',[order.id])).rows[0];if(prior?.idempotency_key===req.get('idempotency-key')){await c.query('COMMIT');return res.json({status:'test_verified',realPayment:false,duplicate:true});}await c.query('ROLLBACK');return res.status(409).json({error:'Order payment is already recorded'});}if(!['unpaid','pending'].includes(order.payment_status)){await c.query('ROLLBACK');return res.status(409).json({error:'Order is not payable'});}const ref='MOCK-'+createHash('sha256').update(order.id+req.get('idempotency-key')).digest('hex').slice(0,24).toUpperCase();await c.query("INSERT INTO eurofy_mock_payment_evidence(order_id,user_id,idempotency_key,amount_gel_minor,provider_reference) VALUES($1,$2,$3,$4,$5)",[order.id,req.user.id,req.get('idempotency-key'),order.total_gel_minor,ref]);await c.query("UPDATE orders SET payment_status='paid',payment_mode='mock' WHERE id=$1",[order.id]);await c.query('COMMIT');res.json({status:'test_verified',realPayment:false,providerReference:ref,notice:'Test-only record; no customer charge occurred.'});}catch(e){await c?.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Mock payment could not be recorded'});}finally{c?.release();}
});
// Orders remain unpaid until a separately integrated payment provider verifies payment.
app.post('/api/orders',auth,async(req,res)=>{
 const {items,deliveryName,deliveryPhone,deliveryAddress}=req.body||{};
 const idempotencyKey=req.get('idempotency-key')||'';
 if(!/^[A-Za-z0-9._:-]{16,200}$/.test(idempotencyKey)||!Array.isArray(items)||items.length<1||items.length>40||items.some(i=>!i||!uuid(i.productId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20)||typeof deliveryName!=='string'||deliveryName.trim().length<2||deliveryName.length>120||typeof deliveryPhone!=='string'||!/^[+0-9 ()-]{7,24}$/.test(deliveryPhone.trim())||typeof deliveryAddress!=='string'||deliveryAddress.trim().length<8||deliveryAddress.length>500)return res.status(400).json({error:'Invalid order fields or missing idempotency key'});
 const ids=items.map(i=>i.productId);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'Duplicate products'});
 const requestHash=createHash('sha256').update(JSON.stringify({items:[...items].sort((a,b)=>a.productId.localeCompare(b.productId)),deliveryName:deliveryName.trim(),deliveryPhone:deliveryPhone.trim(),deliveryAddress:deliveryAddress.trim()})).digest('hex');
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  const reserved=await client.query(`INSERT INTO eurofy_order_request_keys(user_id,idempotency_key,request_hash) VALUES($1,$2,$3)
    ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING id`,[req.user.id,idempotencyKey,requestHash]);
  if(!reserved.rows.length){
   const previous=(await client.query(`SELECT k.request_hash,o.id,o.order_number,o.status,o.payment_status,o.total_gel_minor
     FROM eurofy_order_request_keys k LEFT JOIN orders o ON o.id=k.order_id WHERE k.user_id=$1 AND k.idempotency_key=$2 FOR UPDATE OF k`,[req.user.id,idempotencyKey])).rows[0];
   if(!previous||previous.request_hash!==requestHash){await client.query('ROLLBACK');return res.status(409).json({error:'Idempotency key was already used for a different order'});}
   if(!previous.id){await client.query('ROLLBACK');return res.status(409).json({error:'Matching order request is still being processed'});}
   await client.query('COMMIT');res.set('Cache-Control','no-store').status(200).json({order:{id:previous.id,order_number:previous.order_number,status:previous.status,payment_status:previous.payment_status,total_gel_minor:previous.total_gel_minor},duplicate:true,notice:'Unpaid development order request; no supplier order or payment was initiated.'});return;
  }
  const rows=await listStoreProducts(client,{limit:100});
  const byId=new Map(rows.map(p=>[p.id,p]));
  if(ids.some(id=>!byId.has(id))){await client.query('ROLLBACK');return res.status(409).json({error:'One or more products lack current verified purchase eligibility'});}
  const total=items.reduce((n,i)=>n+byId.get(i.productId).price_gel_minor*i.quantity,0);
  if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid total');
  const number='EF-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(4).toString('hex').toUpperCase();
  const {rows:created}=await client.query("INSERT INTO orders(order_number,user_id,total_gel_minor,delivery_name,delivery_phone,delivery_address,fulfillment_note) VALUES($1,$2,$3,$4,$5,$6,'Unpaid development request; awaiting route quote and administrator review') RETURNING id,order_number,status,payment_status,total_gel_minor",[number,req.user.id,total,deliveryName.trim(),deliveryPhone.trim(),deliveryAddress.trim()]);
  for(const i of items){const p=byId.get(i.productId);await client.query('INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,$3,$4,$5)',[created[0].id,p.id,p.title_ka,p.price_gel_minor,i.quantity]);}
  await client.query('DELETE FROM eurofy_shopping_cart_items WHERE cart_id=(SELECT id FROM eurofy_shopping_carts WHERE user_id=$1) AND product_id=ANY($2::uuid[])',[req.user.id,ids]);
  await client.query('UPDATE eurofy_order_request_keys SET order_id=$2 WHERE user_id=$1 AND idempotency_key=$3',[req.user.id,created[0].id,idempotencyKey]);
  await client.query('COMMIT');
  res.set('Cache-Control','no-store').status(201).json({order:created[0],duplicate:false,notice:'Unpaid development order request; no supplier order or payment was initiated.'});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Development order request failed:',{code:e.code||'UNKNOWN',message:e.message});res.status(e.code==='42P01'||e.code==='42703'?503:500).json({error:e.code==='42P01'||e.code==='42703'?'Order migration is not applied':'Order could not be created'});}
 finally{if(client)client.release();}
});
app.get('/api/admin/orders',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query('SELECT o.id,o.order_number,o.status,o.payment_status,o.payment_mode,o.total_gel_minor,o.created_at,o.pickup_city,o.pickup_location,o.supplier_order_reference,o.parcel_tracking_number,o.fulfillment_note,u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100');const ids=rows.map(o=>o.id);const itemRows=ids.length?(await pool.query('SELECT oi.order_id,oi.product_title_snapshot,oi.quantity,p.supplier_name,p.supplier_product_url,p.supplier_price_gel_minor,p.supplier_stock_quantity,p.supplier_availability,p.supplier_last_synced_at FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=ANY($1::uuid[]) ORDER BY oi.id',[ids])).rows:[];const grouped=new Map();for(const item of itemRows){if(!grouped.has(item.order_id))grouped.set(item.order_id,[]);grouped.get(item.order_id).push(item);}res.json({orders:rows.map(o=>({...o,items:grouped.get(o.id)||[]}))});}
 catch{res.status(500).json({error:'Unable to load orders; apply schema migration'});}
});
const fulfillmentStages=['pending','confirmed','purchased','received_in_germany','in_transit','ready_for_pickup','delivered'];
app.patch('/api/admin/orders/:id/fulfillment',auth,admin,async(req,res)=>{
 const {status,supplierOrderReference,trackingNumber,note}=req.body||{};
 if(!uuid(req.params.id)||!fulfillmentStages.includes(status)&&status!=='cancelled'||[supplierOrderReference,trackingNumber,note].some(v=>v!==undefined&&(typeof v!=='string'||v.length>500)))return res.status(400).json({error:'Invalid fulfillment fields'});
 if(status==='purchased')return res.status(409).json({error:'Supplier purchasing is disabled; use manual review only'});
 try{
  const {rows}=await pool.query('SELECT status,payment_status FROM orders WHERE id=$1',[req.params.id]);
  if(!rows.length)return res.status(404).json({error:'Order not found'});
  const previous=rows[0].status;
  if(previous==='cancelled'||previous==='delivered')return res.status(409).json({error:'Order is closed'});
  const allowed=status==='cancelled'||status===previous||fulfillmentStages.indexOf(status)===fulfillmentStages.indexOf(previous)+1;
  if(!allowed)return res.status(409).json({error:'Complete fulfillment stages in order'});
  if(status==='purchased'&&rows[0].payment_status!=='paid')return res.status(409).json({error:'Payment must be verified before purchasing from supplier'});
  const updated=await pool.query('UPDATE orders SET status=$2,supplier_order_reference=COALESCE($3,supplier_order_reference),parcel_tracking_number=COALESCE($4,parcel_tracking_number),fulfillment_note=COALESCE($5,fulfillment_note) WHERE id=$1 RETURNING id,order_number,status,payment_status',[req.params.id,status,supplierOrderReference?.trim(),trackingNumber?.trim(),note?.trim()]);
  res.json({order:updated.rows[0]});
 }catch{res.status(500).json({error:'Unable to update fulfillment'});}
});
app.get('/api/admin/hybrid-fulfillments',auth,admin,async(_req,res)=>{
 try{const {rows}=await pool.query(`SELECT f.id,f.order_id,o.order_number,o.payment_status,o.payment_mode,f.supplier_product_id,sp.supplier_sku,s.display_name AS supplier_name,f.quantity,f.fulfillment_model,f.status,f.destination_country,f.eu_receiving_country,f.created_at,p.package_reference,p.received_at,p.customs_document_status FROM eurofy_order_fulfillments f JOIN orders o ON o.id=f.order_id JOIN eurofy_supplier_products sp ON sp.id=f.supplier_product_id JOIN eurofy_suppliers s ON s.id=sp.supplier_id LEFT JOIN eurofy_forwarding_packages p ON p.fulfillment_id=f.id ORDER BY f.created_at DESC LIMIT 250`);res.set('Cache-Control','no-store').json({fulfillments:rows});}catch{res.status(503).json({error:'Hybrid fulfillment migration is required'});}
});
app.patch('/api/admin/hybrid-fulfillments/:id/transition',auth,admin,async(req,res)=>{
 const {to,reason,eventKey,trackingReference,receivingReference}=req.body||{};
 if(!uuid(req.params.id)||!safeText(to,40)||!safeText(reason,1000)||!safeText(eventKey,200))return res.status(400).json({error:'Invalid transition request'});
 try{let current=(await pool.query('SELECT f.*,o.payment_status,o.payment_mode FROM eurofy_order_fulfillments f JOIN orders o ON o.id=f.order_id WHERE f.id=$1',[req.params.id])).rows[0];if(!current)return res.status(404).json({error:'Fulfillment not found'});let event={idempotencyKey:eventKey,kind:'admin.status.updated'};if(to==='payment_verified'){const evidence=(await pool.query("SELECT provider_reference FROM eurofy_mock_payment_evidence WHERE order_id=$1 AND status='verified'",[current.order_id])).rows[0];if(current.payment_status!=='paid'||current.payment_mode!=='mock'||!evidence)return res.status(409).json({error:'Verified local mock payment evidence is required'});event={...event,kind:'payment.verified',signatureVerified:true,providerReference:evidence.provider_reference};}if(to==='supplier_order_submitted')event={...event,kind:'supplier.order.submitted',supplierOrderReference:trackingReference};if(to==='supplier_shipped')event={...event,kind:'supplier.shipped',trackingReference};if(to==='eu_received')event={...event,kind:'warehouse.received',receivingReference};const result=await transitionOrderFulfillment(pool,{fulfillmentId:req.params.id,to,event,actorUserId:req.user.id,reason});res.json(result);}catch(e){res.status(409).json({error:e.message||'Transition rejected'});}
});
app.post('/api/admin/hybrid-fulfillments/:id/package',auth,admin,async(req,res)=>{
 const {packageReference,conditionNote='',customsDocumentStatus}=req.body||{};
 if(!uuid(req.params.id)||!safeText(packageReference,120)||typeof conditionNote!=='string'||conditionNote.length>1000||customsDocumentStatus!==undefined&&!['not_started','preparing','ready','submitted','cleared','exception'].includes(customsDocumentStatus))return res.status(400).json({error:'Invalid package record'});
 let c;try{c=await pool.connect();await c.query('BEGIN');const f=(await c.query("SELECT id,fulfillment_model,eu_receiving_country,status FROM eurofy_order_fulfillments WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];if(!f){await c.query('ROLLBACK');return res.status(404).json({error:'Fulfillment not found'});}if(f.fulfillment_model!=='eu_forwarding'){await c.query('ROLLBACK');return res.status(409).json({error:'Package receipt is only valid for EU forwarding'});}const {rows}=await c.query(`INSERT INTO eurofy_forwarding_packages(fulfillment_id,receiving_country,package_reference,received_at,received_by,condition_note,customs_document_status) VALUES($1,$2,$3,now(),$4,$5,COALESCE($6,'not_started')) ON CONFLICT(fulfillment_id) DO UPDATE SET package_reference=EXCLUDED.package_reference,received_at=now(),received_by=EXCLUDED.received_by,condition_note=EXCLUDED.condition_note,customs_document_status=COALESCE($6,eurofy_forwarding_packages.customs_document_status),updated_at=now() RETURNING *`,[f.id,f.eu_receiving_country,packageReference.trim(),req.user.id,conditionNote.trim(),customsDocumentStatus||null]);await c.query("INSERT INTO eurofy_fulfillment_audit_events(fulfillment_id,actor_user_id,action,reason,after_state,idempotency_key) VALUES($1,$2,'forwarding.package.received',$3,$4::jsonb,$5) ON CONFLICT(idempotency_key) DO NOTHING",[f.id,req.user.id,conditionNote.trim(),JSON.stringify({packageReference:packageReference.trim()}),'package-received:'+f.id+':'+packageReference.trim()]);await c.query('COMMIT');res.status(201).json({package:rows[0],notice:'Package reference recorded by admin; shipment and supplier purchases are not initiated.'});}catch(e){await c?.query('ROLLBACK').catch(()=>{});res.status(e.code==='23505'?409:503).json({error:'Package could not be recorded'});}finally{c?.release();}
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
 try{const {rows}=await pool.query('SELECT id,category_id,title_ka,description_ka,price_gel_minor,original_price_gel_minor,supplier_price_gel_minor,supplier_original_gel_minor,markup_override_percent,fixed_price_gel_minor,discount_verified,image_url,sku,is_active,supplier_name,supplier_product_url,supplier_stock_quantity,supplier_availability,supplier_last_synced_at,supplier_sync_source,created_at FROM products ORDER BY created_at DESC LIMIT 200');res.json({products:rows});}
 catch{res.status(500).json({error:'Unable to load products'});}
});
// Import verified snapshots from an authorized supplier feed. No scraping, checkout or payment.
// Prices are supplied in GEL minor units; EUR conversion must happen in a trusted upstream adapter.
app.post('/api/admin/supplier-sync',auth,admin,async(req,res)=>{
 const {source,items}=req.body||{};
 if(typeof source!=='string'||source.length<2||source.length>120||!Array.isArray(items)||items.length<1||items.length>50)return res.status(400).json({error:'Invalid supplier feed batch (1-50 items)'});
 const clean=[];
 for(const item of items){
  if(!item||!uuid(item.productId)||typeof item.supplierName!=='string'||!item.supplierName.trim()||item.supplierName.length>180||typeof item.productUrl!=='string'||item.productUrl.length>1500||!/^https:\/\/[a-z0-9.-]+(?:[/:?#]|$)/i.test(item.productUrl)||!['in_stock','out_of_stock','unknown'].includes(item.availability)||item.stockQuantity!==null&&(!Number.isInteger(item.stockQuantity)||item.stockQuantity<0||item.stockQuantity>100000000)||!(minor(item.priceGelMinor)||Number.isSafeInteger(item.priceEurMinor)&&item.priceEurMinor>=0&&item.priceEurMinor<=100000000)||item.originalPriceGelMinor!==null&&item.originalPriceGelMinor!==undefined&&!minor(item.originalPriceGelMinor)||item.originalPriceEurMinor!==null&&item.originalPriceEurMinor!==undefined&&!minor(item.originalPriceEurMinor)||typeof item.discountVerified!=='boolean')return res.status(400).json({error:'Invalid supplier feed item'});
  clean.push(item);
 }
 if(new Set(clean.map(x=>x.productId)).size!==clean.length)return res.status(400).json({error:'Duplicate product IDs'});
 let c;try{const needsFx=clean.some(x=>x.priceEurMinor!==undefined);const fx=needsFx?await eurGelRate():null;c=await pool.connect();await c.query('BEGIN');let updated=0;
  for(const item of clean){
   const old=(await c.query('SELECT id,category_id,markup_override_percent,fixed_price_gel_minor FROM products WHERE id=$1 FOR UPDATE',[item.productId])).rows[0];if(!old)throw Error('Product not found: '+item.productId);
   const override=old.markup_override_percent===null?null:Number(old.markup_override_percent);
   const supplierCost=fx&&item.priceEurMinor!==undefined?Math.round(item.priceEurMinor*fx.rate):item.priceGelMinor;const supplierOriginal=fx&&item.priceEurMinor!==undefined&&item.originalPriceEurMinor!=null?Math.round(item.originalPriceEurMinor*fx.rate):item.originalPriceGelMinor??null;const price=await calculate(c,supplierCost,old.category_id,override,old.fixed_price_gel_minor);
   const original=item.discountVerified&&supplierOriginal!==null&&supplierOriginal>supplierCost?await calculate(c,supplierOriginal,old.category_id,override,null):null;
   await c.query('UPDATE products SET supplier_name=$2,supplier_product_url=$3,supplier_stock_quantity=$4,supplier_availability=$5,supplier_last_synced_at=now(),supplier_sync_source=$6,supplier_price_gel_minor=$7,supplier_original_gel_minor=$8,discount_verified=$9,price_gel_minor=$10,original_price_gel_minor=$11 WHERE id=$1',[item.productId,item.supplierName.trim(),item.productUrl,item.stockQuantity,item.availability,source,supplierCost,supplierOriginal,item.discountVerified,price,original>price?original:null]);updated++;
  }
  await c.query('COMMIT');res.json({updated,source,exchangeRate:fx?{rate:fx.rate,date:fx.date}:null,notice:'Supplier data imported. No orders or payments were made.'});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});res.status(400).json({error:e.message?.startsWith('Product not found')?e.message:'Supplier sync failed; verify schema and input'});}finally{if(c)c.release();}
});
// Manual supplier metadata entry; automatic syncing requires a permitted supplier feed/API.
app.patch('/api/admin/products/:id/supplier',auth,admin,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:'Invalid product id'});
 const {name,url,stockQuantity,availability}=req.body||{};
 if(typeof name!=='string'||name.length>180||typeof url!=='string'||url.length>1500||(url&&!/^https:\/\/[a-z0-9.-]+(?:[/:?#]|$)/i.test(url))||stockQuantity!==null&&(!Number.isInteger(stockQuantity)||stockQuantity<0||stockQuantity>100000000)||!['unknown','in_stock','out_of_stock'].includes(availability))return res.status(400).json({error:'Invalid supplier metadata'});
 try{const {rows}=await pool.query('UPDATE products SET supplier_name=$2,supplier_product_url=$3,supplier_stock_quantity=$4,supplier_availability=$5,supplier_sync_source=$6,supplier_last_synced_at=NULL WHERE id=$1 RETURNING id,supplier_name,supplier_product_url,supplier_stock_quantity,supplier_availability',[req.params.id,name.trim()||null,url.trim()||null,stockQuantity,availability,'manual']);if(!rows.length)return res.status(404).json({error:'Product not found'});res.json({product:rows[0]});}
 catch{res.status(500).json({error:'Unable to update supplier details; apply schema migration'});}
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
if(process.env.EUROFY_SERVE_STORE==='1'){
 const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 app.get('/',(_req,res)=>res.sendFile(path.join(projectRoot,'index.html')));
 app.get('/admin.html',(_req,res)=>res.sendFile(path.join(projectRoot,'admin.html')));
 app.get('/robots.txt',(_req,res)=>res.sendFile(path.join(projectRoot,'robots.txt')));
 app.use('/assets',express.static(path.join(projectRoot,'assets'),{dotfiles:'deny',fallthrough:true}));
}
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||3000);
const onListen=()=>console.log('EUROFY API listening on '+port);
const server=process.env.EUROFY_LOCAL_ONLY==='1'?app.listen(port,'127.0.0.1',onListen):app.listen(port,onListen);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(async()=>{try{await pool?.end?.()}finally{process.exit(0)}}));
