# EUROFY supplier integration status

## Integration boundary

Supplier adapters must be offline/mock by default. Import only supplier data EUROFY is authorized to use. Never scrape product pages or reuse catalog text/images without written rights. A feed/API response is not itself proof of resale authorization, image rights, delivery availability, or accurate stock.

The current `backend/dropshipping.js` validates a supplier offer, computes an indicative quote, and creates a manual-review draft. `backend/hybrid-fulfillment.js` evaluates direct-to-Georgia and EU-forwarding routes only from explicit permissions and sourced costs. It does not call a supplier, buy goods, or initiate payment. The API's current admin supplier-sync route accepts a manually submitted batch; it is not a provider connector and does not keep a versioned import history.

The additive migration now provides supplier identity, per-product SKU/authorization, price and stock snapshots, image-license evidence, and fulfillment persistence tables. It has only been tested against embedded PostgreSQL. No supplier data was imported and the migration was not applied to Render.

## Syncee

Syncee support has confirmed that custom-store API access requires manual activation by its team. Do not assume API credentials, free access, product-feed permission, or delivery to Georgia. Before implementing a live adapter, request written confirmation of:

- API activation steps, documentation, authentication, sandbox/test environment, rate limits, webhook/polling limits, and credential rotation.
- Setup fees, subscription tiers, per-order fees, currency-conversion fees, and any minimum commitments.
- Which specific suppliers and SKUs authorize EUROFY's resale, catalog text, product photos, and other media, including territory and duration.
- Product identifiers/SKU mappings; supported languages; current and original prices; currency; inventory quantity/status; timestamps; minimum order quantities; and stock/price change behavior.
- Whether the selected suppliers ship directly to Georgia; if not, supported EU delivery addresses, parcel dimensions/weights, delivery prices and times, and restrictions.
- Who receives and fulfills an order, when payment is captured, cancellation windows, returns, defective goods, lost parcels, tracking events, and customer-support responsibility.
- Tax/VAT treatment, invoices, customs/export documentation, and any data-protection terms for customer delivery data.

API access must remain a disabled adapter until written activation and fees are reviewed and the owner separately authorizes any paid plan. Build an offline mock against a documented interface in the meantime.

## Outlet46

Outlet46 has confirmed it does not offer an API, CSV/XML product feeds, or automatic inventory synchronization. It is therefore not an automatic catalog source for this project. Do not scrape its storefront. Any future manual product use would first require checking current written resale, media, shipping, tax, and returns permissions; do not assume an EU-address delivery supports forwarding or commercial resale.

## Adapter contract to implement

Each provider adapter should expose offline-testable operations for catalog import, offer validation, live availability check, draft order preparation, order submission (disabled unless separately authorized), cancellation/return request, and tracking lookup. Persist source, supplier SKU, currency, source timestamp, authorization evidence reference, image-rights evidence, import result, and an immutable price/stock snapshot. Require an idempotency key for imports and any future order submission. Never expose supplier purchase price, credentials, or private supplier notes through public catalog responses.

For fulfillment, store direct-shipping destinations separately from EU receiving destinations and onward-export destinations. Keep supplier delivery to an EU address separate from permission to resell and export the product to Georgia. The route engine will not recommend an option until verified, complete costs and a verified delivery window exist.

## Mission 4 status — 16 November 2026

Supplier access remains mock/manual-review only. The local order operation APIs do not call Syncee, Outlet46, a supplier endpoint, or a carrier. Supplier order submission remains blocked by the domain state guard. No supplier authorization, delivery quote, stock, resale right, or EU onward-export right is inferred from existing marketplace access. The current admin panel can inspect hybrid fulfillment records and register a real EU package reference only after an authorized order exists. Syncee manual API enablement, documented API interface/credentials, commercial costs, per-supplier resale/image permissions, Georgia delivery, and EU receiving/onward-export permissions are outstanding external dependencies.
