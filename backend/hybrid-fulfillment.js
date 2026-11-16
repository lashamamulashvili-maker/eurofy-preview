const COUNTRIES=/^[A-Z]{2}$/;
const MODELS=['direct_dropship','eu_forwarding'];
const MAX_COST_AGE_MS=24*60*60*1000;
const MAX_FX_AGE_MS=72*60*60*1000;
const MAX_ETA_AGE_MS=7*24*60*60*1000;
const asCountry=(value,name)=>{
  if(typeof value!=='string'||!COUNTRIES.test(value))throw new TypeError(`Invalid ${name}`);
  return value;
};
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const safeMinor=value=>Number.isSafeInteger(value)&&value>=0;

function isFresh(verifiedAt,assessmentTime,maxAgeMs) {
  const timestamp=Date.parse(verifiedAt);
  return Number.isFinite(timestamp)&&timestamp<=assessmentTime+5*60*1000&&assessmentTime-timestamp<=maxAgeMs;
}

function quoteRoute(route,model,marginBps,assessmentTime) {
  const requiredTypes=model==='direct_dropship'
    ?['supplier_purchase','supplier_to_georgia']
    :['supplier_purchase','supplier_to_eu','eu_to_georgia'];
  const costs=Array.isArray(route.costs)?route.costs:[];
  const missing=[];
  if(route.costsComplete!==true)missing.push('complete_cost_breakdown_unverified');
  for(const type of requiredTypes)if(!costs.some(item=>item?.type===type))missing.push(`missing_${type}_cost`);
  if(!costs.length)missing.push('cost_breakdown_missing');
  const converted=[];
  for(const item of costs) {
    if(!item||!nonEmpty(item.type)||!safeMinor(item.amountMinor)||typeof item.currencyCode!=='string'||!/^[A-Z]{3}$/.test(item.currencyCode)) {
      throw new TypeError('Invalid route cost item');
    }
    if(item.verified!==true||!nonEmpty(item.evidenceRef)||!isFresh(item.verifiedAt,assessmentTime,MAX_COST_AGE_MS)) {
      missing.push(`unverified_${item.type}_cost`);
      continue;
    }
    let numerator=1,denominator=1;
    if(item.currencyCode!=='GEL') {
      const rate=item.exchangeRate;
      if(!rate||rate.verified!==true||!nonEmpty(rate.source)||!nonEmpty(rate.asOf)||!Number.isSafeInteger(rate.numerator)||!Number.isSafeInteger(rate.denominator)||rate.numerator<1||rate.denominator<1) {
        missing.push(`verified_${item.currencyCode}_exchange_rate_missing`);
        continue;
      }
      if(!isFresh(rate.asOf,assessmentTime,MAX_FX_AGE_MS)) {
        missing.push(`stale_${item.currencyCode}_exchange_rate`);
        continue;
      }
      numerator=rate.numerator;denominator=rate.denominator;
    }
    const n=BigInt(item.amountMinor)*BigInt(numerator),d=BigInt(denominator);
    const gelMinor=(n+d-1n)/d;
    if(gelMinor>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Route cost overflow');
    converted.push({type:item.type,currencyCode:item.currencyCode,amountMinor:item.amountMinor,gelMinor:Number(gelMinor),evidenceRef:item.evidenceRef});
  }
  if(missing.length)return {quote:null,missing:[...new Set(missing)]};
  const totalBig=converted.reduce((sum,item)=>sum+BigInt(item.gelMinor),0n);
  const denominator=BigInt(10000-marginBps);
  const retailBig=(totalBig*10000n+denominator-1n)/denominator;
  if(totalBig>BigInt(Number.MAX_SAFE_INTEGER)||retailBig>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Route price overflow');
  const totalCostGelMinor=Number(totalBig),retailPriceGelMinor=Number(retailBig);
  return {quote:{costs:converted,totalCostGelMinor,retailPriceGelMinor,estimatedProfitGelMinor:retailPriceGelMinor-totalCostGelMinor,marginBps,verified:true},missing:[]};
}

function etaBlockers(eta,assessmentTime) {
  if(!eta||eta.verified!==true||!nonEmpty(eta.evidenceRef)||!isFresh(eta.verifiedAt,assessmentTime,MAX_ETA_AGE_MS)||!Number.isSafeInteger(eta.minDays)||!Number.isSafeInteger(eta.maxDays)||eta.minDays<0||eta.maxDays<eta.minDays) return ['verified_delivery_window_missing_or_stale'];
  return [];
}

function buildRoute({model,route,supplier,destinationCountry,euReceivingCountry,marginBps,assessmentTime}) {
  const blockers=[];
  if(supplier.resaleAuthorized!==true||!nonEmpty(supplier.resaleEvidenceRef)||supplier.termsVerified!==true) blockers.push('verified_supplier_resale_authorization_missing');
  if(model==='direct_dropship') {
    if(route?.enabled!==true)blockers.push('direct_shipping_not_enabled');
    if(route?.termsVerified!==true)blockers.push('direct_shipping_terms_unverified');
    if(!supplier.directShipCountries.includes(destinationCountry))blockers.push('supplier_does_not_confirm_destination');
  } else {
    if(route?.enabled!==true)blockers.push('eu_forwarding_not_enabled');
    if(!euReceivingCountry)blockers.push('eu_receiving_country_missing');
    else if(!supplier.euDeliveryCountries.includes(euReceivingCountry))blockers.push('supplier_eu_delivery_not_confirmed');
    if(route?.supplierDeliveryTermsVerified!==true)blockers.push('supplier_eu_delivery_terms_unverified');
    if(!supplier.onwardExportCountries.includes(destinationCountry))blockers.push('onward_export_not_authorized');
    if(route?.forwarderTermsVerified!==true)blockers.push('forwarder_terms_unverified');
  }
  if(blockers.length)return {model,eligible:false,blockers,quote:null,deliveryWindow:null,recommendable:false};
  const eta=route.eta;
  const etaMissing=etaBlockers(eta,assessmentTime);
  const priced=quoteRoute(route,model,marginBps,assessmentTime);
  const deliveryWindow=etaMissing.length?null:{minDays:eta.minDays,maxDays:eta.maxDays};
  return {model,eligible:true,blockers:[],quote:priced.quote,missingEstimateData:priced.missing,deliveryWindow,recommendable:!!priced.quote&&!etaMissing.length,etaBlockers:etaMissing};
}

export function assessHybridFulfillment(input) {
  if(!input||typeof input!=='object')throw new TypeError('Fulfillment assessment required');
  const destinationCountry=asCountry(input.destinationCountry,'destination country');
  const euReceivingCountry=input.euReceivingCountry==null?null:asCountry(input.euReceivingCountry,'EU receiving country');
  const assessmentTime=Date.parse(input.assessmentAt||new Date().toISOString());
  if(!Number.isFinite(assessmentTime))throw new TypeError('Invalid assessment timestamp');
  const supplier=input.supplier;
  if(!supplier||!Array.isArray(supplier.directShipCountries)||!Array.isArray(supplier.euDeliveryCountries)||!Array.isArray(supplier.onwardExportCountries)) throw new TypeError('Supplier route permissions are required');
  for(const [list,name] of [[supplier.directShipCountries,'direct destination'],[supplier.euDeliveryCountries,'EU delivery'],[supplier.onwardExportCountries,'onward export']]) list.forEach(code=>asCountry(code,name));
  const marginBps=input.marginBps;
  if(!Number.isSafeInteger(marginBps)||marginBps<0||marginBps>=10000)throw new RangeError('Invalid gross margin');
  const routes={
    direct:buildRoute({model:'direct_dropship',route:input.routes?.direct||{},supplier,destinationCountry,euReceivingCountry,marginBps,assessmentTime}),
    forwarding:buildRoute({model:'eu_forwarding',route:input.routes?.forwarding||{},supplier,destinationCountry,euReceivingCountry,marginBps,assessmentTime})
  };
  const eligible=[routes.direct,routes.forwarding].filter(route=>route.recommendable);
  eligible.sort((a,b)=>a.quote.totalCostGelMinor-b.quote.totalCostGelMinor||a.deliveryWindow.maxDays-b.deliveryWindow.maxDays||(a.model==='direct_dropship'?-1:1));
  const autoRecommendation=eligible.length?{model:eligible[0].model,reason:'lowest_verified_cost_then_delivery_time'}:null;
  const result={destinationCountry,euReceivingCountry,routes,autoRecommendation,selection:null,selectionAuditEvent:null};
  const override=input.manualOverride;
  if(override!==undefined&&override!==null) {
    if(!MODELS.includes(override.model)||!nonEmpty(override.actorUserId)||!nonEmpty(override.reason))throw new TypeError('Manual override requires a valid route, administrator and reason');
    const selected=Object.values(routes).find(route=>route.model===override.model);
    if(!selected?.eligible)throw new Error('Cannot manually select a route without verified route eligibility');
    result.selection={model:selected.model,source:'manual_override',quote:selected.quote,warning:!selected.quote?'Cost estimate is incomplete and must be reviewed before customer pricing.':!selected.deliveryWindow?'Delivery window is unverified or stale.':null};
    result.selectionAuditEvent={action:'fulfillment.route.manual_override',actorUserId:override.actorUserId.trim(),reason:override.reason.trim(),selectedModel:selected.model};
  } else if(autoRecommendation) {
    const selected=routes[autoRecommendation.model==='direct_dropship'?'direct':'forwarding'];
    result.selection={model:selected.model,source:'automatic_verified_comparison',quote:selected.quote,warning:null};
  }
  return result;
}

const TRANSITIONS={
  order_created:['payment_pending','cancelled'],
  payment_pending:['payment_verified','failed','cancelled'],
  payment_verified:['supplier_review','cancellation_requested'],
  supplier_review:['supplier_order_draft','cancellation_requested','failed'],
  supplier_order_draft:['supplier_order_submitted','cancellation_requested'],
  supplier_order_submitted:['supplier_shipped','cancellation_requested','failed'],
  supplier_shipped:['eu_receipt_pending','delivered'],
  eu_receipt_pending:['eu_received'],
  eu_received:['forwarding'],
  forwarding:['customs'],
  customs:['delivered'],
  cancellation_requested:['cancelled','refund_pending','failed'],
  refund_pending:['refunded','failed'],
  cancelled:[],refunded:[],delivered:[],failed:[]
};

const EVENT_REQUIREMENTS={
  payment_verified:event=>event.kind==='payment.verified'&&event.signatureVerified===true&&nonEmpty(event.providerReference),
  supplier_order_submitted:event=>event.kind==='supplier.order.submitted'&&nonEmpty(event.supplierOrderReference),
  supplier_shipped:event=>event.kind==='supplier.shipped'&&nonEmpty(event.trackingReference),
  eu_received:event=>event.kind==='warehouse.received'&&nonEmpty(event.receivingReference),
  refunded:event=>event.kind==='refund.verified'&&event.signatureVerified===true&&nonEmpty(event.providerReference)
};

export function transitionFulfillment({status,to,model,event,supplierSubmissionEnabled=false}) {
  if(!MODELS.includes(model))throw new TypeError('Invalid fulfillment model');
  if(!Array.isArray(TRANSITIONS[status])||!TRANSITIONS[status].includes(to))throw new Error(`Invalid fulfillment transition: ${status} -> ${to}`);
  if(!event||!nonEmpty(event.idempotencyKey)||!nonEmpty(event.kind))throw new TypeError('A unique event idempotency key is required');
  if(to==='supplier_order_submitted'&&supplierSubmissionEnabled!==true)throw new Error('Supplier ordering is disabled; draft remains in manual review');
  if(to==='eu_receipt_pending'&&model!=='eu_forwarding')throw new Error('Direct-to-customer route cannot enter EU receiving');
  if(to==='delivered'&&model==='eu_forwarding'&&status!=='customs')throw new Error('Forwarding orders must clear customs before delivery');
  if(to==='delivered'&&model==='direct_dropship'&&status!=='supplier_shipped')throw new Error('Direct orders must be supplier-shipped before delivery');
  const requirement=EVENT_REQUIREMENTS[to];
  if(requirement&&!requirement(event))throw new Error(`Verified ${to} event evidence is required`);
  return {status:to,eventRecord:{idempotencyKey:event.idempotencyKey,kind:event.kind,from:status,to,model}};
}
