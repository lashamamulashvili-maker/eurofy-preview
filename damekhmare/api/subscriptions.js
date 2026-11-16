// Subscription read-only status and explicit local test activation.
// No payment collection, renewal, card handling or paid service integration.
export function mountSubscriptions(app,{pool,auth}){
 const unavailable=res=>res.status(503).json({error:'Database unavailable'});
 const present=row=>({status:row?.status??'inactive',priceGelMinor:2000,autoRenewOptIn:row?.auto_renew_opt_in??false,expiresAt:row?.expires_at??null,hasAccess:!!row&&['active','test_active'].includes(row.status)&&row.expires_at&&new Date(row.expires_at)>new Date()});
 app.get('/api/subscription',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  try{const {rows}=await pool.query('SELECT status,auto_renew_opt_in,expires_at FROM dm_subscriptions WHERE account_id=$1',[req.account.id]);res.set('Cache-Control','no-store').json({subscription:present(rows[0])})}catch{unavailable(res)}
 });
 app.post('/api/subscription/test-activate',auth,async(req,res)=>{
  if(!pool)return unavailable(res);
  if(process.env.DAMEKHMARE_ALLOW_TEST_SUBSCRIPTIONS!=='true')return res.status(403).json({error:'Test subscriptions are disabled'});
  if(req.body?.confirmTestOnly!==true)return res.status(400).json({error:'Explicit test confirmation required'});
  try{
   const {rows}=await pool.query("INSERT INTO dm_subscriptions(account_id,status,expires_at,auto_renew_opt_in) VALUES($1,'test_active',now()+interval '30 days',false) ON CONFLICT(account_id) DO UPDATE SET status='test_active',expires_at=now()+interval '30 days',auto_renew_opt_in=false,updated_at=now() RETURNING status,auto_renew_opt_in,expires_at",[req.account.id]);
   res.set('Cache-Control','no-store').json({subscription:present(rows[0]),paymentCollected:false});
  }catch{unavailable(res)}
 });
}
