// Transactional offer acceptance and booking workflows, isolated from EUROFY.
export function mountBookings(app,{pool,auth}){
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 const unavailable=res=>res.status(503).json({error:'Database unavailable'});
 app.post('/api/offers/:id/accept',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id)||typeof req.body?.scheduledFor!=='string')return res.status(400).json({error:'Invalid booking details'});
  const scheduled=new Date(req.body.scheduledFor);
  if(!Number.isFinite(scheduled.getTime())||scheduled.getTime()<=Date.now()||scheduled.getTime()>Date.now()+366*86400000)return res.status(400).json({error:'Select a future date within one year'});
  const client=await pool.connect().catch(()=>null);if(!client)return unavailable(res);
  try{
   await client.query('BEGIN');
   const {rows}=await client.query("SELECT o.id,o.request_id,o.provider_id,o.status,r.customer_id,r.status AS request_status FROM dm_offers o JOIN dm_requests r ON r.id=o.request_id WHERE o.id=$1 FOR UPDATE OF o,r",[req.params.id]);
   const offer=rows[0];
   if(!offer||offer.customer_id!==req.account.id){await client.query('ROLLBACK');return res.status(404).json({error:'Offer not found'})}
   if(offer.status!=='pending'||offer.request_status!=='open'){await client.query('ROLLBACK');return res.status(409).json({error:'Offer is no longer available'})}
   await client.query("UPDATE dm_offers SET status='accepted' WHERE id=$1",[offer.id]);
   await client.query("UPDATE dm_offers SET status='declined' WHERE request_id=$1 AND id<>$2 AND status='pending'",[offer.request_id,offer.id]);
   await client.query("UPDATE dm_requests SET status='assigned' WHERE id=$1",[offer.request_id]);
   const booking=await client.query("INSERT INTO dm_bookings(offer_id,scheduled_for) VALUES($1,$2) RETURNING id,offer_id,scheduled_for,status",[offer.id,scheduled.toISOString()]);
   await client.query('COMMIT');res.status(201).set('Cache-Control','no-store').json({booking:booking.rows[0]});
  }catch{await client.query('ROLLBACK').catch(()=>{});unavailable(res)}finally{client.release()}
 });
 app.get('/api/bookings',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  try{const {rows}=await pool.query("SELECT b.id,b.scheduled_for,b.status,o.amount_gel_minor,r.title,r.city,r.id AS request_id,CASE WHEN r.customer_id=$1 THEN 'customer' ELSE 'provider' END AS participation FROM dm_bookings b JOIN dm_offers o ON o.id=b.offer_id JOIN dm_requests r ON r.id=o.request_id WHERE r.customer_id=$1 OR o.provider_id=$1 ORDER BY b.created_at DESC LIMIT 100",[req.account.id]);res.set('Cache-Control','no-store').json({bookings:rows})}catch{unavailable(res)}
 });
 app.patch('/api/bookings/:id/status',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id)||!['confirmed','completed','cancelled'].includes(req.body?.status))return res.status(400).json({error:'Invalid status'});
  const client=await pool.connect().catch(()=>null);if(!client)return unavailable(res);
  try{
   await client.query('BEGIN');
   const {rows}=await client.query("SELECT b.id,b.status,o.provider_id,r.customer_id,r.id AS request_id FROM dm_bookings b JOIN dm_offers o ON o.id=b.offer_id JOIN dm_requests r ON r.id=o.request_id WHERE b.id=$1 FOR UPDATE OF b,r",[req.params.id]);
   const b=rows[0];if(!b||![b.customer_id,b.provider_id].includes(req.account.id)){await client.query('ROLLBACK');return res.status(404).json({error:'Booking not found'})}
   const next=req.body.status;
   const allowed=(next==='confirmed'&&b.status==='requested'&&req.account.id===b.provider_id)||(next==='completed'&&b.status==='confirmed'&&req.account.id===b.customer_id)||(next==='cancelled'&&['requested','confirmed'].includes(b.status));
   if(!allowed){await client.query('ROLLBACK');return res.status(409).json({error:'Invalid booking transition or role'})}
   const result=await client.query('UPDATE dm_bookings SET status=$2 WHERE id=$1 RETURNING id,status',[b.id,next]);
   if(next==='completed'||next==='cancelled')await client.query('UPDATE dm_requests SET status=$2 WHERE id=$1',[b.request_id,next]);
   await client.query('COMMIT');res.set('Cache-Control','no-store').json({booking:result.rows[0]});
  }catch{await client.query('ROLLBACK').catch(()=>{});unavailable(res)}finally{client.release()}
 });
}
