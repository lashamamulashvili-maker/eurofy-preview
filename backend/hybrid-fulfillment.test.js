import test from 'node:test';
import assert from 'node:assert/strict';
import {assessHybridFulfillment,transitionFulfillment} from './hybrid-fulfillment.js';

const cost=(type,amountMinor,currencyCode='GEL')=>({
  type,amountMinor,currencyCode,verified:true,evidenceRef:`evidence:${type}`,verifiedAt:'2026-11-16T11:00:00Z',
  ...(currencyCode==='GEL'?{}:{exchangeRate:{numerator:3,denominator:1,verified:true,source:'fixture',asOf:'2026-11-16'}})
});
const supplier={
  supplierId:'supplier-1',resaleAuthorized:true,resaleEvidenceRef:'contract:1',termsVerified:true,
  directShipCountries:['GE'],euDeliveryCountries:['DE'],onwardExportCountries:['GE']
};
const routes={
  direct:{enabled:true,termsVerified:true,eta:{minDays:8,maxDays:14,verified:true,evidenceRef:'eta:direct',verifiedAt:'2026-11-16T11:00:00Z'},costsComplete:true,costs:[cost('supplier_purchase',1000,'EUR'),cost('supplier_to_georgia',500,'EUR')]},
  forwarding:{enabled:true,supplierDeliveryTermsVerified:true,forwarderTermsVerified:true,eta:{minDays:11,maxDays:16,verified:true,evidenceRef:'eta:forward',verifiedAt:'2026-11-16T11:00:00Z'},costsComplete:true,costs:[cost('supplier_purchase',1000,'EUR'),cost('supplier_to_eu',100,'EUR'),cost('eu_to_georgia',2500)]}
};
const input=overrides=>({destinationCountry:'GE',euReceivingCountry:'DE',supplier,marginBps:2000,assessmentAt:'2026-11-16T12:00:00Z',routes,...overrides});

test('compares fully verified routes and chooses the lower landed cost',()=>{
  const result=assessHybridFulfillment(input({}));
  assert.equal(result.routes.direct.quote.totalCostGelMinor,4500);
  assert.equal(result.routes.direct.quote.retailPriceGelMinor,5625);
  assert.equal(result.routes.forwarding.quote.totalCostGelMinor,5800);
  assert.equal(result.autoRecommendation.model,'direct_dropship');
  assert.equal(result.selection.source,'automatic_verified_comparison');
});

test('does not infer onward export permission from EU delivery permission',()=>{
  const restricted={...supplier,onwardExportCountries:[]};
  const result=assessHybridFulfillment(input({supplier:restricted}));
  assert.equal(result.routes.forwarding.eligible,false);
  assert.ok(result.routes.forwarding.blockers.includes('onward_export_not_authorized'));
  assert.equal(result.routes.direct.eligible,true);
});

test('blocks all routes without evidenced supplier resale authorization',()=>{
  const result=assessHybridFulfillment(input({supplier:{...supplier,resaleAuthorized:false,resaleEvidenceRef:null}}));
  assert.equal(result.routes.direct.eligible,false);
  assert.equal(result.routes.forwarding.eligible,false);
  assert.equal(result.autoRecommendation,null);
  assert.equal(result.selection,null);
});

test('requires direct destination permission separately from EU forwarding',()=>{
  const result=assessHybridFulfillment(input({supplier:{...supplier,directShipCountries:[]}}));
  assert.equal(result.routes.direct.eligible,false);
  assert.equal(result.routes.forwarding.eligible,true);
  assert.equal(result.autoRecommendation.model,'eu_forwarding');
});

test('withholds automatic recommendations if costs or ETA are unverified',()=>{
  const partial={...routes,direct:{...routes.direct,costsComplete:false,costs:[...routes.direct.costs,cost('unverified',50)]},forwarding:{...routes.forwarding,eta:{minDays:11,maxDays:16,verified:false}}};
  const result=assessHybridFulfillment(input({routes:partial}));
  assert.equal(result.autoRecommendation,null);
  assert.equal(result.routes.direct.quote,null);
  assert.equal(result.routes.forwarding.quote.totalCostGelMinor,5800);
});

test('does not convert a non-GEL cost without a sourced and dated FX rate',()=>{
  const noFx={...routes,direct:{...routes.direct,costs:[{...cost('supplier_purchase',100,'EUR'),exchangeRate:undefined},routes.direct.costs[1]]}};
  const result=assessHybridFulfillment(input({routes:noFx}));
  assert.equal(result.routes.direct.quote,null);
  assert.ok(result.routes.direct.missingEstimateData.includes('verified_EUR_exchange_rate_missing'));
});

test('withholds route recommendations when cost or delivery evidence is stale',()=>{
  const staleCosts=routes.direct.costs.map((item,index)=>index===0?{...item,exchangeRate:{...item.exchangeRate,asOf:'2026-11-12'}}:item);
  const stale={...routes,direct:{...routes.direct,costs:staleCosts},forwarding:{...routes.forwarding,eta:{...routes.forwarding.eta,verifiedAt:'2026-11-01T00:00:00Z'}}};
  const result=assessHybridFulfillment(input({routes:stale}));
  assert.equal(result.routes.direct.quote,null);
  assert.ok(result.routes.direct.missingEstimateData.includes('stale_EUR_exchange_rate'));
  assert.equal(result.routes.forwarding.deliveryWindow,null);
  assert.equal(result.autoRecommendation,null);
});

test('manual administrator override records actor, reason, and chosen eligible route',()=>{
  const result=assessHybridFulfillment(input({manualOverride:{model:'eu_forwarding',actorUserId:'admin-1',reason:'Supplier has a confirmed Georgia delivery suspension.'}}));
  assert.equal(result.autoRecommendation.model,'direct_dropship');
  assert.equal(result.selection.model,'eu_forwarding');
  assert.equal(result.selection.source,'manual_override');
  assert.equal(result.selectionAuditEvent.actorUserId,'admin-1');
  assert.match(result.selectionAuditEvent.reason,/confirmed/);
});

test('manual override cannot bypass route permissions or omit its reason',()=>{
  assert.throws(()=>assessHybridFulfillment(input({supplier:{...supplier,onwardExportCountries:[]},manualOverride:{model:'eu_forwarding',actorUserId:'admin-1',reason:'override'}})),/verified route eligibility/);
  assert.throws(()=>assessHybridFulfillment(input({manualOverride:{model:'direct_dropship',actorUserId:'admin-1',reason:''}})),/administrator and reason/);
});

test('rejects malformed destination and invalid gross margin',()=>{
  assert.throws(()=>assessHybridFulfillment(input({destinationCountry:'GEO'})),/Invalid destination country/);
  assert.throws(()=>assessHybridFulfillment(input({marginBps:10000})),/Invalid gross margin/);
});

test('payment verification requires trusted provider evidence',()=>{
  assert.throws(()=>transitionFulfillment({status:'payment_pending',to:'payment_verified',model:'direct_dropship',event:{idempotencyKey:'e1',kind:'payment.verified',signatureVerified:false,providerReference:'p1'}}),/Verified payment_verified event/);
  const result=transitionFulfillment({status:'payment_pending',to:'payment_verified',model:'direct_dropship',event:{idempotencyKey:'e2',kind:'payment.verified',signatureVerified:true,providerReference:'mock:p1'}});
  assert.equal(result.status,'payment_verified');
});

test('supplier submission remains disabled by default after manual review',()=>{
  assert.throws(()=>transitionFulfillment({status:'supplier_order_draft',to:'supplier_order_submitted',model:'direct_dropship',event:{idempotencyKey:'e3',kind:'supplier.order.submitted',supplierOrderReference:'mock:1'}}),/ordering is disabled/);
});

test('fulfillment paths keep direct delivery separate from EU receiving and forwarding',()=>{
  assert.throws(()=>transitionFulfillment({status:'supplier_shipped',to:'eu_receipt_pending',model:'direct_dropship',event:{idempotencyKey:'e4',kind:'warehouse.received',receivingReference:'wh:1'}}),/cannot enter EU receiving/);
  assert.throws(()=>transitionFulfillment({status:'supplier_shipped',to:'delivered',model:'eu_forwarding',event:{idempotencyKey:'e5',kind:'delivery.confirmed'}}),/clear customs/);
  assert.equal(transitionFulfillment({status:'supplier_shipped',to:'delivered',model:'direct_dropship',event:{idempotencyKey:'e6',kind:'delivery.confirmed'}}).status,'delivered');
  assert.equal(transitionFulfillment({status:'customs',to:'delivered',model:'eu_forwarding',event:{idempotencyKey:'e7',kind:'delivery.confirmed'}}).status,'delivered');
});
