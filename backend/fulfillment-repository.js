import {transitionFulfillment} from './hybrid-fulfillment.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY=/^[A-Z]{2}$/;
const text=value=>typeof value==='string'&&value.trim().length>0;

async function withTransaction(database,work) {
  const client=typeof database.connect==='function'?await database.connect():database;
  try {
    await client.query('BEGIN');
    const result=await work(client);
    await client.query('COMMIT');
    return result;
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    if(client!==database)client.release();
  }
}

function routeEligible(assessment,model) {
  const route=assessment?.routes?.[model==='direct_dropship'?'direct':'forwarding'];
  return route?.eligible===true&&route.recommendable===true&&route.quote?.verified===true&&assessment.selection?.model===model;
}

export async function createOrderFulfillment(database,{orderId,supplierProductId,quantity=1,idempotencyKey,assessment,actorUserId=null}) {
  if(!UUID.test(orderId||'')||!UUID.test(supplierProductId||''))throw new TypeError('Valid order and supplier-product ids are required');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>20)throw new RangeError('Invalid fulfillment quantity');
  if(!text(idempotencyKey)||idempotencyKey.length>200)throw new TypeError('A bounded idempotency key is required');
  const model=assessment?.selection?.model;
  if(!['direct_dropship','eu_forwarding'].includes(model)||!routeEligible(assessment,model))throw new Error('A verified eligible route and complete quote are required');
  const overrideEvent=assessment.selectionAuditEvent;
  if(assessment.selection.source==='manual_override'&&(!text(actorUserId)||overrideEvent?.actorUserId!==actorUserId||!text(overrideEvent?.reason)))throw new Error('Manual route override must be recorded by the authenticated administrator');
  const destinationCountry=assessment.destinationCountry;
  const euReceivingCountry=model==='eu_forwarding'?assessment.euReceivingCountry:null;
  if(!COUNTRY.test(destinationCountry||'')||(euReceivingCountry!==null&&!COUNTRY.test(euReceivingCountry)))throw new TypeError('Invalid fulfillment destination');

  return withTransaction(database,async client=>{
    const previous=await client.query('SELECT id,order_id,supplier_product_id,quantity,fulfillment_model,status FROM eurofy_order_fulfillments WHERE idempotency_key=$1',[idempotencyKey]);
    if(previous.rows.length) {
      const row=previous.rows[0];
      if(row.order_id!==orderId||row.supplier_product_id!==supplierProductId||row.quantity!==quantity||row.fulfillment_model!==model)throw new Error('Idempotency key was already used for another fulfillment');
      return {fulfillment:row,created:false,duplicate:true};
    }
    const priorLine=await client.query('SELECT id,order_id,supplier_product_id,quantity,fulfillment_model,status FROM eurofy_order_fulfillments WHERE order_id=$1 AND supplier_product_id=$2 FOR UPDATE',[orderId,supplierProductId]);
    if(priorLine.rows.length) {
      const row=priorLine.rows[0];
      if(row.quantity!==quantity||row.fulfillment_model!==model)throw new Error('Order line already has a different fulfillment request');
      return {fulfillment:row,created:false,duplicate:true};
    }

    const offer=await client.query(`SELECT sp.id,sp.supplier_id,sp.product_id,sp.authorized_for_resale,sp.authorization_evidence_ref,sp.terms_verified_at,
      sp.supplier_price_minor,sp.currency_code,sp.direct_shipping_enabled,sp.direct_ship_countries,
      sp.eu_delivery_enabled,sp.eu_delivery_countries,sp.onward_export_countries,
      s.enabled AS supplier_enabled,s.resale_authorized,s.resale_evidence_ref,s.terms_verified_at AS supplier_terms_verified_at,
      s.direct_ship_countries AS supplier_direct_ship_countries,s.eu_delivery_countries AS supplier_eu_delivery_countries,
      s.onward_export_countries AS supplier_onward_export_countries,
      p.is_active,p.publication_status,
      ph.price_minor AS latest_price_minor,ph.currency_code AS latest_currency_code,ph.observed_at
      FROM eurofy_supplier_products sp
      JOIN eurofy_suppliers s ON s.id=sp.supplier_id
      JOIN products p ON p.id=sp.product_id
      LEFT JOIN LATERAL (SELECT price_minor,currency_code,observed_at FROM eurofy_supplier_price_history WHERE supplier_product_id=sp.id ORDER BY observed_at DESC LIMIT 1) ph ON true
      WHERE sp.id=$1 FOR UPDATE OF sp`,[supplierProductId]);
    if(!offer.rows.length)throw new Error('Supplier offer not found');
    const row=offer.rows[0];
    const authorized=row.supplier_enabled===true&&row.resale_authorized===true&&text(row.resale_evidence_ref)&&row.supplier_terms_verified_at&&row.authorized_for_resale===true&&text(row.authorization_evidence_ref)&&row.terms_verified_at;
    if(!authorized)throw new Error('Supplier resale authorization is not verified');
    if(row.is_active!==true||row.publication_status!=='published')throw new Error('Product is not published for real orders');
    const inventory=await client.query(`SELECT id,availability,quantity,stale_after FROM eurofy_inventory_snapshots
      WHERE supplier_product_id=$1 ORDER BY checked_at DESC LIMIT 1 FOR UPDATE`,[supplierProductId]);
    const stock=inventory.rows[0];
    if(stock?.availability!=='in_stock'||!Number.isSafeInteger(stock.quantity)||!stock.stale_after||new Date(stock.stale_after)<=new Date())throw new Error('Verified inventory is unavailable or stale');
    const reserved=await client.query("SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM eurofy_inventory_reservations WHERE supplier_product_id=$1 AND status='reserved'",[supplierProductId]);
    if(stock.quantity-reserved.rows[0].quantity<quantity)throw new Error('Verified inventory is unavailable or stale');
    if(row.supplier_price_minor===null||row.latest_price_minor!==row.supplier_price_minor||row.latest_currency_code!==row.currency_code||!row.observed_at||Date.now()-new Date(row.observed_at).getTime()>24*60*60*1000)throw new Error('Supplier price history is stale or does not match the current offer');
    if(model==='direct_dropship'&&(!row.direct_shipping_enabled||!row.direct_ship_countries.includes(destinationCountry)||!row.supplier_direct_ship_countries.includes(destinationCountry)))throw new Error('Direct destination is not authorized by supplier');
    if(model==='eu_forwarding'&&(!row.eu_delivery_enabled||!row.eu_delivery_countries.includes(euReceivingCountry)||!row.supplier_eu_delivery_countries.includes(euReceivingCountry)||!row.onward_export_countries.includes(destinationCountry)||!row.supplier_onward_export_countries.includes(destinationCountry)))throw new Error('EU receiving or onward export is not authorized');
    const order=await client.query('SELECT id,payment_status FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
    if(!order.rows.length)throw new Error('Customer order not found');
    if(!['unpaid','pending'].includes(order.rows[0].payment_status))throw new Error('Order is not awaiting payment verification');
    const orderLine=await client.query('SELECT quantity FROM order_items WHERE order_id=$1 AND product_id=$2',[orderId,row.product_id]);
    if(!orderLine.rows.length||orderLine.rows[0].quantity<quantity)throw new Error('Customer order line does not contain the requested product quantity');

    const inserted=await client.query(`INSERT INTO eurofy_order_fulfillments
      (order_id,supplier_product_id,quantity,fulfillment_model,status,destination_country,eu_receiving_country,idempotency_key,route_snapshot)
      VALUES($1,$2,$3,$4,'order_created',$5,$6,$7,$8::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id,order_id,supplier_product_id,quantity,fulfillment_model,status,destination_country,eu_receiving_country,idempotency_key,route_snapshot,created_at,updated_at`,
      [orderId,supplierProductId,quantity,model,destinationCountry,euReceivingCountry,idempotencyKey,JSON.stringify(assessment)]);
    if(!inserted.rows.length) {
      const concurrent=await client.query('SELECT id,order_id,supplier_product_id,quantity,fulfillment_model,status FROM eurofy_order_fulfillments WHERE idempotency_key=$1',[idempotencyKey]);
      if(!concurrent.rows.length)throw new Error('Concurrent fulfillment insert could not be resolved');
      const existing=concurrent.rows[0];
      if(existing.order_id!==orderId||existing.supplier_product_id!==supplierProductId||existing.quantity!==quantity||existing.fulfillment_model!==model)throw new Error('Idempotency key was already used for another fulfillment');
      return {fulfillment:existing,created:false,duplicate:true};
    }
    const fulfillment=inserted.rows[0];
    await client.query(`INSERT INTO eurofy_inventory_reservations(supplier_product_id,fulfillment_id,quantity,status,idempotency_key)
      VALUES($1,$2,$3,'reserved',$4)`,[supplierProductId,fulfillment.id,quantity,`reservation:${idempotencyKey}`]);
    await client.query(`INSERT INTO eurofy_fulfillment_audit_events(fulfillment_id,actor_user_id,action,reason,before_state,after_state,idempotency_key)
      VALUES($1,$2,'fulfillment.created','',NULL,$3::jsonb,$4)`,[fulfillment.id,actorUserId,JSON.stringify({status:'order_created',model}),idempotencyKey]);
    if(assessment.selection.source==='manual_override') {
      await client.query(`INSERT INTO eurofy_fulfillment_audit_events(fulfillment_id,actor_user_id,action,reason,before_state,after_state,idempotency_key)
        VALUES($1,$2,'fulfillment.route.manual_override',$3,NULL,$4::jsonb,$5)`,[
        fulfillment.id,actorUserId,overrideEvent.reason,JSON.stringify({model,quote:assessment.selection.quote}),`${idempotencyKey}:route-override`
      ]);
    }
    return {fulfillment,created:true,duplicate:false};
  });
}

export async function transitionOrderFulfillment(database,{fulfillmentId,to,event,actorUserId=null,reason=''}) {
  if(!UUID.test(fulfillmentId||''))throw new TypeError('Valid fulfillment id is required');
  if(!text(reason)||reason.length>1000)throw new TypeError('A short transition reason is required');
  if(!text(event?.idempotencyKey))throw new TypeError('A unique event idempotency key is required');
  return withTransaction(database,async client=>{
    const selected=await client.query('SELECT id,order_id,fulfillment_model,status,destination_country,eu_receiving_country FROM eurofy_order_fulfillments WHERE id=$1 FOR UPDATE',[fulfillmentId]);
    if(!selected.rows.length)throw new Error('Fulfillment not found');
    const current=selected.rows[0];
    const replay=await client.query('SELECT fulfillment_id FROM eurofy_fulfillment_audit_events WHERE idempotency_key=$1',[event.idempotencyKey]);
    if(replay.rows.length) {
      if(replay.rows[0].fulfillment_id!==fulfillmentId)throw new Error('Event idempotency key was already used for another fulfillment');
      return {fulfillment:current,duplicate:true};
    }
    const transition=transitionFulfillment({status:current.status,to,model:current.fulfillment_model,event});
    const updated=await client.query(`UPDATE eurofy_order_fulfillments SET status=$2,updated_at=now()
      WHERE id=$1 AND status=$3
      RETURNING id,order_id,fulfillment_model,status,destination_country,eu_receiving_country,updated_at`,[fulfillmentId,to,current.status]);
    if(!updated.rows.length)throw new Error('Fulfillment changed concurrently; retry with a new event key');
    await client.query(`INSERT INTO eurofy_fulfillment_audit_events
      (fulfillment_id,actor_user_id,action,reason,before_state,after_state,idempotency_key)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,[
      fulfillmentId,actorUserId,transition.eventRecord.kind,reason,
      JSON.stringify({status:current.status,model:current.fulfillment_model}),
      JSON.stringify({status:updated.rows[0].status,model:current.fulfillment_model}),
      transition.eventRecord.idempotencyKey
    ]);
    if(to==='delivered')await client.query("UPDATE eurofy_inventory_reservations SET status='fulfilled',updated_at=now() WHERE fulfillment_id=$1 AND status='reserved'",[fulfillmentId]);
    else if(['cancelled','failed'].includes(to)&&['order_created','payment_pending','payment_verified','supplier_review','supplier_order_draft','cancellation_requested'].includes(current.status)) {
      await client.query("UPDATE eurofy_inventory_reservations SET status='released',updated_at=now() WHERE fulfillment_id=$1 AND status='reserved'",[fulfillmentId]);
    }
    return {fulfillment:updated.rows[0],duplicate:false};
  });
}
