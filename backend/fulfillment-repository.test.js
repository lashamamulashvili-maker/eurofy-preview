import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {runMigrations} from './migration-runner.js';
import {assessHybridFulfillment} from './hybrid-fulfillment.js';
import {createOrderFulfillment,transitionOrderFulfillment} from './fulfillment-repository.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const makeAssessment=()=>{
  const now=new Date();
  const iso=now.toISOString();
  const date=iso.slice(0,10);
  return assessHybridFulfillment({
  destinationCountry:'GE',euReceivingCountry:'DE',marginBps:2000,assessmentAt:iso,
  supplier:{resaleAuthorized:true,resaleEvidenceRef:'test-contract',termsVerified:true,directShipCountries:['GE'],euDeliveryCountries:['DE'],onwardExportCountries:['GE']},
  routes:{
    direct:{enabled:true,termsVerified:true,eta:{minDays:7,maxDays:12,verified:true,evidenceRef:'eta:direct',verifiedAt:iso},costsComplete:true,costs:[
      {type:'supplier_purchase',amountMinor:1000,currencyCode:'EUR',verified:true,evidenceRef:'price:1',verifiedAt:iso,exchangeRate:{numerator:3,denominator:1,verified:true,source:'mock-fx',asOf:date}},
      {type:'supplier_to_georgia',amountMinor:1000,currencyCode:'GEL',verified:true,evidenceRef:'shipping:1',verifiedAt:iso}
    ]},
    forwarding:{enabled:false,supplierDeliveryTermsVerified:false,forwarderTermsVerified:false,eta:{verified:false},costsComplete:false,costs:[]}
  }
});
};

test('order fulfillment persists once, transitions transactionally, and never submits supplier orders by default',async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec(await readFile(path.join(root,'database/schema.sql'),'utf8'));
    await runMigrations(db,path.join(root,'database/migrations'));
    const assessment=makeAssessment();
    const freshnessAt=new Date().toISOString();
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    const user=(await db.query("INSERT INTO users(email,password_hash,full_name) VALUES('test@example.invalid','hash','Test Customer') RETURNING id")).rows[0];
    const product=(await db.query("INSERT INTO products(title_ka,price_gel_minor,is_active,publication_status) VALUES('Approved test product',10000,true,'published') RETURNING id")).rows[0];
    const supplier=(await db.query(`INSERT INTO eurofy_suppliers(supplier_code,display_name,provider_type,enabled,resale_authorized,resale_evidence_ref,terms_verified_at,direct_ship_countries,eu_delivery_countries,onward_export_countries)
      VALUES('MOCK-A','Mock Supplier','mock',true,true,'contract:test',now(),ARRAY['GE'],ARRAY['DE'],ARRAY['GE']) RETURNING id`)).rows[0];
    const offer=(await db.query(`INSERT INTO eurofy_supplier_products(supplier_id,product_id,supplier_sku,currency_code,supplier_price_minor,authorized_for_resale,authorization_evidence_ref,direct_shipping_enabled,direct_ship_countries,eu_delivery_enabled,eu_delivery_countries,onward_export_countries,terms_verified_at)
      VALUES($1,$2,'SKU-1','EUR',1000,true,'offer-rights:test',true,ARRAY['GE'],true,ARRAY['DE'],ARRAY['GE'],now()) RETURNING id`,[supplier.id,product.id])).rows[0];
    await db.query("INSERT INTO eurofy_inventory_snapshots(supplier_product_id,availability,quantity,source,checked_at,stale_after) VALUES($1,'in_stock',5,'mock',$2,$3)",[offer.id,freshnessAt,expiresAt]);
    await db.query("INSERT INTO eurofy_supplier_price_history(supplier_product_id,price_minor,currency_code,source,observed_at) VALUES($1,1000,'EUR','mock',$2)",[offer.id,freshnessAt]);
    const order=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-1',$1,11000) RETURNING id",[user.id])).rows[0];
    await db.query("INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,'Approved test product',5500,2)",[order.id,product.id]);

    const first=await createOrderFulfillment(db,{orderId:order.id,supplierProductId:offer.id,quantity:2,idempotencyKey:'create:1',assessment,actorUserId:user.id});
    assert.equal(first.created,true);
    assert.equal(first.fulfillment.status,'order_created');
    assert.equal((await db.query("SELECT quantity FROM eurofy_inventory_reservations WHERE fulfillment_id=$1",[first.fulfillment.id])).rows[0].quantity,2);
    const duplicate=await createOrderFulfillment(db,{orderId:order.id,supplierProductId:offer.id,quantity:2,idempotencyKey:'create:1-retry',assessment,actorUserId:user.id});
    assert.equal(duplicate.duplicate,true);
    assert.equal(duplicate.fulfillment.id,first.fulfillment.id);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM eurofy_order_fulfillments')).rows[0].count,1);

    const overstockOrder=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-6',$1,22000) RETURNING id",[user.id])).rows[0];
    await db.query("INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,'Approved test product',5500,4)",[overstockOrder.id,product.id]);
    await assert.rejects(createOrderFulfillment(db,{orderId:overstockOrder.id,supplierProductId:offer.id,quantity:4,idempotencyKey:'create:overstock',assessment,actorUserId:user.id}),/inventory is unavailable or stale/);

    const missingLineOrder=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-2',$1,10000) RETURNING id",[user.id])).rows[0];
    await assert.rejects(createOrderFulfillment(db,{orderId:missingLineOrder.id,supplierProductId:offer.id,quantity:1,idempotencyKey:'create:missing-line',assessment,actorUserId:user.id}),/does not contain the requested product quantity/);

    const pending=await transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'payment_pending',event:{kind:'checkout.accepted',idempotencyKey:'event:pending-1'},actorUserId:user.id,reason:'Development checkout created'});
    assert.equal(pending.fulfillment.status,'payment_pending');
    const replay=await transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'payment_pending',event:{kind:'checkout.accepted',idempotencyKey:'event:pending-1'},actorUserId:user.id,reason:'Duplicate callback'});
    assert.equal(replay.duplicate,true);
    await assert.rejects(transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'payment_verified',event:{kind:'payment.verified',signatureVerified:false,providerReference:'bad',idempotencyKey:'event:bad-payment'},actorUserId:user.id,reason:'Invalid mock event'}),/Verified payment_verified/);
    const stillPending=(await db.query('SELECT status FROM eurofy_order_fulfillments WHERE id=$1',[first.fulfillment.id])).rows[0];
    assert.equal(stillPending.status,'payment_pending');
    await transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'payment_verified',event:{kind:'payment.verified',signatureVerified:true,providerReference:'mock:pay-1',idempotencyKey:'event:payment-1'},actorUserId:user.id,reason:'Mock provider verification'});
    await transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'supplier_review',event:{kind:'admin.review.started',idempotencyKey:'event:review-1'},actorUserId:user.id,reason:'Admin review started'});
    await transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'supplier_order_draft',event:{kind:'supplier.draft.created',idempotencyKey:'event:draft-1'},actorUserId:user.id,reason:'Prepare offline draft'});
    await assert.rejects(transitionOrderFulfillment(db,{fulfillmentId:first.fulfillment.id,to:'supplier_order_submitted',event:{kind:'supplier.order.submitted',supplierOrderReference:'real-order-should-not-exist',idempotencyKey:'event:submit-1'},actorUserId:user.id,reason:'Should be blocked'}),/ordering is disabled/);
    assert.equal((await db.query('SELECT status FROM eurofy_order_fulfillments WHERE id=$1',[first.fulfillment.id])).rows[0].status,'supplier_order_draft');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM supplier_purchases')).rows[0].count,0);

    const audits=await db.query('SELECT count(*)::int AS count FROM eurofy_fulfillment_audit_events WHERE fulfillment_id=$1',[first.fulfillment.id]);
    assert.equal(audits.rows[0].count,5);

    const overrideOrder=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-5',$1,7000) RETURNING id",[user.id])).rows[0];
    await db.query("INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,'Approved test product',7000,1)",[overrideOrder.id,product.id]);
    const overrideIso=new Date().toISOString();
    const overrideDate=overrideIso.slice(0,10);
    const overrideAssessment=assessHybridFulfillment({
      destinationCountry:'GE',euReceivingCountry:'DE',marginBps:2000,assessmentAt:overrideIso,
      supplier:{resaleAuthorized:true,resaleEvidenceRef:'test-contract',termsVerified:true,directShipCountries:['GE'],euDeliveryCountries:['DE'],onwardExportCountries:['GE']},
      routes:{
        direct:{enabled:true,termsVerified:true,eta:{minDays:7,maxDays:12,verified:true,evidenceRef:'eta:direct',verifiedAt:overrideIso},costsComplete:true,costs:[
          {type:'supplier_purchase',amountMinor:1000,currencyCode:'EUR',verified:true,evidenceRef:'price:1',verifiedAt:overrideIso,exchangeRate:{numerator:3,denominator:1,verified:true,source:'mock-fx',asOf:overrideDate}},
          {type:'supplier_to_georgia',amountMinor:1000,currencyCode:'GEL',verified:true,evidenceRef:'shipping:1',verifiedAt:overrideIso}
        ]},
        forwarding:{enabled:true,supplierDeliveryTermsVerified:true,forwarderTermsVerified:true,eta:{minDays:10,maxDays:14,verified:true,evidenceRef:'eta:forward',verifiedAt:overrideIso},costsComplete:true,costs:[
          {type:'supplier_purchase',amountMinor:1000,currencyCode:'EUR',verified:true,evidenceRef:'price:1',verifiedAt:overrideIso,exchangeRate:{numerator:3,denominator:1,verified:true,source:'mock-fx',asOf:overrideDate}},
          {type:'supplier_to_eu',amountMinor:100,currencyCode:'EUR',verified:true,evidenceRef:'eu-delivery:1',verifiedAt:overrideIso,exchangeRate:{numerator:3,denominator:1,verified:true,source:'mock-fx',asOf:overrideDate}},
          {type:'eu_to_georgia',amountMinor:2500,currencyCode:'GEL',verified:true,evidenceRef:'forwarding:1',verifiedAt:overrideIso}
        ]}
      },
      manualOverride:{model:'eu_forwarding',actorUserId:user.id,reason:'Mock direct lane is temporarily unavailable.'}
    });
    const overrideFulfillment=await createOrderFulfillment(db,{orderId:overrideOrder.id,supplierProductId:offer.id,quantity:1,idempotencyKey:'create:override',assessment:overrideAssessment,actorUserId:user.id});
    assert.equal(overrideFulfillment.fulfillment.fulfillment_model,'eu_forwarding');
    const overrideAudit=await db.query("SELECT actor_user_id,reason FROM eurofy_fulfillment_audit_events WHERE fulfillment_id=$1 AND action='fulfillment.route.manual_override'",[overrideFulfillment.fulfillment.id]);
    assert.equal(overrideAudit.rows[0].actor_user_id,user.id);
    assert.equal(overrideAudit.rows[0].reason,'Mock direct lane is temporarily unavailable.');
    assert.equal((await db.query("SELECT COALESCE(SUM(quantity),0)::int AS count FROM eurofy_inventory_reservations WHERE supplier_product_id=$1 AND status='reserved'",[offer.id])).rows[0].count,3);

    const unauthorizedOrder=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-3',$1,5500) RETURNING id",[user.id])).rows[0];
    await db.query("INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,'Approved test product',5500,1)",[unauthorizedOrder.id,product.id]);
    await db.query('UPDATE eurofy_supplier_products SET authorized_for_resale=false WHERE id=$1',[offer.id]);
    await assert.rejects(createOrderFulfillment(db,{orderId:unauthorizedOrder.id,supplierProductId:offer.id,quantity:1,idempotencyKey:'create:unauthorized',assessment,actorUserId:user.id}),/resale authorization is not verified/);
    await db.query('UPDATE eurofy_supplier_products SET authorized_for_resale=true WHERE id=$1',[offer.id]);

    const staleOrder=(await db.query("INSERT INTO orders(order_number,user_id,total_gel_minor) VALUES('EF-DB-4',$1,5500) RETURNING id",[user.id])).rows[0];
    await db.query("INSERT INTO order_items(order_id,product_id,product_title_snapshot,unit_price_gel_minor,quantity) VALUES($1,$2,'Approved test product',5500,1)",[staleOrder.id,product.id]);
    await db.query("INSERT INTO eurofy_inventory_snapshots(supplier_product_id,availability,quantity,source,stale_after) VALUES($1,'out_of_stock',0,'mock',now()+interval '1 day')",[offer.id]);
    await assert.rejects(createOrderFulfillment(db,{orderId:staleOrder.id,supplierProductId:offer.id,quantity:1,idempotencyKey:'create:stale-stock',assessment,actorUserId:user.id}),/inventory is unavailable or stale/);
  } finally { await db.close(); }
});
