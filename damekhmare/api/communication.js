// Private booking conversations and customer reviews.
export function mountCommunication(app,{pool,auth}){
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 const unavailable=res=>res.status(503).json({error:'Database unavailable'});
 async function participant(bookingId,accountId){
  const {rows}=await pool.query('SELECT b.id,b.status,r.customer_id,o.provider_id FROM dm_bookings b JOIN dm_offers o ON o.id=b.offer_id JOIN dm_requests r ON r.id=o.request_id WHERE b.id=$1 AND (r.customer_id=$2 OR o.provider_id=$2)',[bookingId,accountId]);return rows[0]||null;
 }
 app.get('/api/bookings/:id/messages',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id))return res.status(400).json({error:'Invalid booking'});
  try{if(!await participant(req.params.id,req.account.id))return res.status(404).json({error:'Booking not found'});const {rows}=await pool.query('SELECT id,sender_id,body,created_at FROM dm_messages WHERE booking_id=$1 ORDER BY created_at,id LIMIT 200',[req.params.id]);res.set('Cache-Control','no-store').json({messages:rows})}catch{unavailable(res)}
 });
 app.post('/api/bookings/:id/messages',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id)||typeof req.body?.body!=='string'||req.body.body.trim().length<1||req.body.body.length>4000)return res.status(400).json({error:'Invalid message'});
  try{const p=await participant(req.params.id,req.account.id);if(!p)return res.status(404).json({error:'Booking not found'});if(['cancelled','completed'].includes(p.status))return res.status(409).json({error:'Conversation is closed'});const {rows}=await pool.query('INSERT INTO dm_messages(booking_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,body,created_at',[req.params.id,req.account.id,req.body.body.trim()]);res.status(201).set('Cache-Control','no-store').json({message:rows[0]})}catch{unavailable(res)}
 });
 app.post('/api/bookings/:id/review',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id)||!Number.isInteger(req.body?.rating)||req.body.rating<1||req.body.rating>5||typeof(req.body.comment??'')!=='string'||(req.body.comment??'').length>2000)return res.status(400).json({error:'Invalid review'});
  try{const p=await participant(req.params.id,req.account.id);if(!p||p.customer_id!==req.account.id)return res.status(404).json({error:'Booking not found'});if(p.status!=='completed')return res.status(409).json({error:'Booking must be completed'});const {rows}=await pool.query('INSERT INTO dm_reviews(booking_id,author_id,rating,comment) VALUES($1,$2,$3,$4) RETURNING id,rating,comment,created_at',[req.params.id,req.account.id,req.body.rating,(req.body.comment??'').trim()]);res.status(201).json({review:rows[0]})}catch(e){res.status(e.code==='23505'?409:503).json({error:e.code==='23505'?'Review already exists':'Review unavailable'})}
 });
 app.get('/api/providers/:id/reviews',async(req,res)=>{
  if(!pool)return unavailable(res);
  if(!uuid(req.params.id))return res.status(400).json({error:'Invalid provider'});
  try{const {rows}=await pool.query("SELECT v.rating,v.comment,v.created_at,a.display_name AS author_name FROM dm_reviews v JOIN dm_bookings b ON b.id=v.booking_id JOIN dm_offers o ON o.id=b.offer_id JOIN dm_accounts a ON a.id=v.author_id JOIN dm_provider_profiles p ON p.account_id=o.provider_id WHERE o.provider_id=$1 AND p.verification_status='approved' ORDER BY v.created_at DESC LIMIT 100",[req.params.id]);res.json({reviews:rows})}catch{unavailable(res)}
 });
}
