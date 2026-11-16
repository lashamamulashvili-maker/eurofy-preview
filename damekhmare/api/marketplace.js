// Isolated DAMEKHMARE provider onboarding and offer endpoints.
// Mount only behind the same local-only API, with shared authenticated middleware.
export function mountMarketplace(app,{pool,auth}){
 const unavailable=res=>res.status(503).json({error:'Local database unavailable'});
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 app.post('/api/provider/profile',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  const {city,bio='',serviceArea=''}=req.body||{};
  if(typeof city!=='string'||city.trim().length<2||city.length>100||typeof bio!=='string'||bio.length>2000||typeof serviceArea!=='string'||serviceArea.length>300)return res.status(400).json({error:'Invalid provider profile'});
  const client=await pool.connect().catch(()=>null);
  if(!client)return unavailable(res);
  try{
   await client.query('BEGIN');
   await client.query('UPDATE dm_accounts SET role_provider=true WHERE id=$1',[req.account.id]);
   const {rows}=await client.query("INSERT INTO dm_provider_profiles(account_id,city,bio,service_area) VALUES($1,$2,$3,$4) ON CONFLICT(account_id) DO UPDATE SET city=excluded.city,bio=excluded.bio,service_area=excluded.service_area RETURNING account_id,city,bio,service_area,verification_status",[req.account.id,city.trim(),bio.trim(),serviceArea.trim()]);
   await client.query('COMMIT');res.status(201).json({profile:rows[0]});
  }catch{await client.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Unable to save provider profile'})}finally{client.release()}
 });
 app.get('/api/providers',async(req,res)=>{
  if(!pool)return unavailable(res);
  const city=typeof req.query.city==='string'?req.query.city.trim().slice(0,100):'';
  try{const {rows}=await pool.query("SELECT p.account_id AS id,a.display_name,p.city,p.bio,p.service_area FROM dm_provider_profiles p JOIN dm_accounts a ON a.id=p.account_id WHERE p.verification_status='approved' AND ($1='' OR lower(p.city)=lower($1)) ORDER BY p.created_at DESC LIMIT 50",[city]);res.json({providers:rows})}catch{unavailable(res)}
 });
 app.post('/api/provider/services',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  const {categoryId,priceFromGelMinor=null}=req.body||{};
  if(!uuid(categoryId)||!(priceFromGelMinor===null||(Number.isSafeInteger(priceFromGelMinor)&&priceFromGelMinor>=0&&priceFromGelMinor<=100000000)))return res.status(400).json({error:'Invalid service'});
  try{
   const {rows}=await pool.query("INSERT INTO dm_provider_services(provider_id,category_id,price_from_gel_minor) SELECT p.account_id,$2,$3 FROM dm_provider_profiles p WHERE p.account_id=$1 ON CONFLICT(provider_id,category_id) DO UPDATE SET price_from_gel_minor=excluded.price_from_gel_minor RETURNING provider_id,category_id,price_from_gel_minor",[req.account.id,categoryId,priceFromGelMinor]);
   if(!rows.length)return res.status(403).json({error:'Provider profile required'});
   res.status(201).json({service:rows[0]});
  }catch(e){res.status(e.code==='23503'?400:503).json({error:'Unable to save service'})}
 });
 app.post('/api/offers',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  const {requestId,amountGelMinor,note=''}=req.body||{};
  if(!uuid(requestId)||!Number.isSafeInteger(amountGelMinor)||amountGelMinor<0||amountGelMinor>100000000||typeof note!=='string'||note.length>2000)return res.status(400).json({error:'Invalid offer'});
  try{
   const {rows}=await pool.query("INSERT INTO dm_offers(request_id,provider_id,amount_gel_minor,note) SELECT r.id,p.account_id,$3,$4 FROM dm_requests r JOIN dm_provider_profiles p ON p.account_id=$1 AND p.verification_status='approved' WHERE r.id=$2 AND r.status='open' AND r.customer_id<>$1 AND EXISTS(SELECT 1 FROM dm_provider_services s WHERE s.provider_id=$1 AND s.category_id=r.category_id) RETURNING id,request_id,amount_gel_minor,note,status",[req.account.id,requestId,amountGelMinor,note.trim()]);
   if(!rows.length)return res.status(403).json({error:'Approved matching provider and open request required'});
   res.status(201).json({offer:rows[0]});
  }catch(e){res.status(e.code==='23505'?409:503).json({error:e.code==='23505'?'Offer already submitted':'Unable to create offer'})}
 });
 app.get('/api/requests/:id/offers',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id))return res.status(400).json({error:'Invalid request ID'});
  try{
   const {rows:ownership}=await pool.query('SELECT customer_id FROM dm_requests WHERE id=$1',[req.params.id]);
   if(!ownership.length)return res.status(404).json({error:'Request not found'});
   if(ownership[0].customer_id!==req.account.id)return res.status(403).json({error:'Forbidden'});
   const {rows}=await pool.query('SELECT o.id,o.amount_gel_minor,o.note,o.status,o.created_at,a.display_name AS provider_name FROM dm_offers o JOIN dm_accounts a ON a.id=o.provider_id WHERE o.request_id=$1 ORDER BY o.created_at DESC',[req.params.id]);
   res.set('Cache-Control','no-store').json({offers:rows});
  }catch{unavailable(res)}
 });
}
