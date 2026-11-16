// EUROFY dropshipping pricing and supplier intake — offline, no supplier calls or purchases.
const money = (value, field) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(field + ' must be non-negative integer minor units');
  return value;
};
const currency = code => {
  if (!/^[A-Z]{3}$/.test(code || '')) throw new TypeError('Invalid ISO currency code');
  return code;
};
export function validateSupplierOffer(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Offer required');
  const {supplierId, supplierSku, title, currencyCode, costMinor, shippingMinor, stock, authorizedForResale, imageRightsConfirmed} = input;
  for (const [name, value] of Object.entries({supplierId,supplierSku,title})) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new TypeError('Invalid '+name);
  }
  currency(currencyCode);
  money(costMinor,'costMinor'); money(shippingMinor,'shippingMinor');
  if (!Number.isSafeInteger(stock) || stock < 0) throw new RangeError('Invalid stock');
  if (authorizedForResale !== true) throw new Error('Supplier resale authorization required');
  return {supplierId:supplierId.trim(),supplierSku:supplierSku.trim(),title:title.trim(),currencyCode,costMinor,shippingMinor,stock,authorizedForResale:true,imageRightsConfirmed:imageRightsConfirmed===true};
}
export function calculateRetailQuote({costMinor,shippingMinor,handlingMinor=0,customsEstimateMinor=0,marginBps,fxNumerator=1,fxDenominator=1}) {
  const base=BigInt(money(costMinor,'costMinor'))+BigInt(money(shippingMinor,'shippingMinor'))+BigInt(money(handlingMinor,'handlingMinor'))+BigInt(money(customsEstimateMinor,'customsEstimateMinor'));
  if (![marginBps,fxNumerator,fxDenominator].every(Number.isSafeInteger) || marginBps<0 || marginBps>=10000 || fxNumerator<=0 || fxDenominator<=0) throw new RangeError('Invalid margin or exchange-rate ratio');
  const fxNumeratorBig=BigInt(fxNumerator), fxDenominatorBig=BigInt(fxDenominator);
  const costTarget=(base*fxNumeratorBig+fxDenominatorBig-1n)/fxDenominatorBig;
  const marginDenominator=BigInt(10000-marginBps);
  const retail=(costTarget*10000n+marginDenominator-1n)/marginDenominator;
  if (costTarget>BigInt(Number.MAX_SAFE_INTEGER) || retail>BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Price overflow');
  const estimatedCostMinor=Number(costTarget), retailMinor=Number(retail);
  return {estimatedCostMinor,retailMinor,estimatedMarginMinor:retailMinor-estimatedCostMinor,indicative:true,requiresLiveStockCheck:true,requiresShippingAndTaxConfirmation:true};
}
export function createDraftSupplierOrder({offer,quantity,customerOrderId}) {
  const item=validateSupplierOffer(offer);
  if (!Number.isSafeInteger(quantity)||quantity<1||quantity>20||quantity>item.stock) throw new RangeError('Quantity unavailable');
  if (typeof customerOrderId!=='string'||!customerOrderId.trim()) throw new TypeError('Customer order reference required');
  return {customerOrderId, supplierId:item.supplierId, supplierSku:item.supplierSku,quantity,status:'awaiting_manual_review',paymentInitiated:false,supplierOrderSubmitted:false};
}
