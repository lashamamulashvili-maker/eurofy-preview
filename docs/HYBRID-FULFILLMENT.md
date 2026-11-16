# EUROFY hybrid fulfillment — design and execution plan

## Two fulfillment models

| Model | Required verified permissions | Delivery legs |
|---|---|---|
| `direct_dropship` | Supplier resale evidence, verified supplier terms, and explicit supplier permission for the customer destination (Georgia in the initial market) | Supplier → customer |
| `eu_forwarding` | Supplier resale evidence, verified supplier delivery to the chosen EU receiving country, separate onward-export permission to the customer destination, and verified forwarder terms | Supplier → EUROFY EU receiving address → Georgia |

An EU delivery destination is not treated as permission to resell or export onward. The route engine blocks a route when any applicable permission is missing. It does not contact a supplier, carrier, payment provider, or customer.

## Current implementation

- `backend/hybrid-fulfillment.js` evaluates both routes and returns explicit blockers.
- Route costs must be itemized, complete, verified, and supported by evidence references. Non-GEL costs require a sourced and dated FX ratio. Conversion rounds up in integer minor units; no exchange rate or fee is invented.
- Cost evidence is limited to 24 hours, FX evidence to 72 hours, and ETA evidence to 7 days; old or future-dated evidence is rejected. Supplier offer prices are independently checked against price history no older than 24 hours. Automatic selection is withheld unless the route has a fully verified cost breakdown and a verified delivery window. Eligible routes are compared by landed cost, then maximum delivery days.
- An administrator can override an eligible route with an actor ID and reason. The engine returns an audit event to persist; route eligibility cannot be overridden.
- The order state helper separates payment-pending from verified payment, direct delivery from EU receiving/forwarding, and customs from final delivery. Payment verification requires a signed/trusted provider event. Supplier submission is disabled by default and has no side effect in this module.
- `database/migrations/20261116_001_hybrid_fulfillment.sql` adds suppliers, supplier product/SKU authorization, stock and price snapshots, image-license evidence, customer addresses, carts, route quotes, order fulfillment states, shipment legs/events, and audit-event tables. Existing products receive `publication_status='demo'`; existing rows are retained.
- `backend/fulfillment-repository.js` creates one fulfillment per order/SKU, checks supplier authorization, published-product state, inventory and price freshness, reserves stock transactionally to prevent overselling, and records idempotent status changes in audit storage. Reservations are released on eligible cancellation/failure paths and finalized on delivery. Supplier submission remains blocked.
- `backend/migration-runner.js` records migration checksums and applies pending files transactionally. `backend/migrate.js` requires `--local` and a loopback PostgreSQL URL. The API does not run migrations at startup.

## Execution plan

1. **Domain, schema, and persistence foundation — implemented and tested.** Add the pure route evaluator, status transition guard, additive migration, guarded local runner, transactional repository, and embedded-PostgreSQL tests.
2. **API integration — next.** Mount authenticated API routes for supplier/offer administration, route assessment, persistent quotes, carts, and fulfillment records. Reuse the domain guards inside transactions; keep real payment and supplier submission endpoints disabled.
3. **Database-backed catalog — next.** Update public catalog queries to show only explicitly published products with active resale authorization, current stock evidence, and licensed images. Preserve demo catalog labeling and avoid treating legacy products as real offers.
4. **Customer experience — next.** Connect login, addresses, persistent cart, unpaid development orders, order history, cancellation requests, and tracking to the API; do not persist browser bearer tokens or accept client totals.
5. **Operational integrations — blocked on external approvals.** Build provider adapters against mocks first. Activate Syncee only after manual API enablement, written rights, commercial terms, destination eligibility, and forwarding/export permission are confirmed.
6. **Staging/launch — blocked.** The Render database cannot be queried from this environment because its IP allowlist is empty. Do not change it to run these migrations. Reconcile the database safely on a locally controlled staging connection after a verified backup and explicit operations review.

## Verification boundary

The migration has been exercised against an ephemeral PGlite PostgreSQL database, including rollback, checksum, rerun, and preservation checks. It has **not** been applied to the Render database. The API routes, browser UI, and shipment integrations do not yet consume this schema or domain module; therefore the hybrid platform is not yet a complete customer-facing flow.

## Mission 3 storefront wiring

- `/api/products` now calls the verified catalog repository and accepts server-side `q` and category filters. It hides demo/unpublished offers and requires current stock/price, explicit resale and Georgia shipping evidence, and a verified image license. The ordinary storefront consumes this response; an empty catalog is expected until authorized products are entered.
- Authenticated `GET /api/cart` and `PUT /api/cart/items/:productId` persist cart lines and reject ineligible products or quantities beyond unreserved stock. The storefront keeps guest cart data in the browser and syncs valid UUID items after account login.
- `POST /api/orders` now requires an idempotency key, revalidates catalog prices and eligibility on the server, writes the order and item snapshots transactionally, and leaves `payment_status='unpaid'`. The UI calls this an unpaid development order request. It does not create a fulfillment record, reserve inventory, or claim a delivery estimate. Route quote selection and reservation remain a required next step before any checkout could be considered production-ready.
- `backend/local-database.js`, `backend/migrate.js --pglite`, and `backend/dev.js` provide a persistent embedded PostgreSQL-compatible local database and same-origin local storefront/API. Data is stored outside Git in `.eurofy-data/`.

## Mission 4 order operations

- Migration `20261116_003_order_operations.sql` adds `orders.payment_mode`, unique mock payment evidence with GEL amount and mock reference, quote evidence fields, and EU forwarding package/receipt/customs-document records. No card fields exist in the mock evidence table.
- `POST /api/my-orders/:id/mock-payment` is restricted to local PGlite, requires an authenticated owner and idempotency key, records test-only evidence, changes payment mode to `mock`, and states that no real charge occurred. A second key cannot silently pay the same order.
- `GET /api/my-orders/:id` scopes records to the authenticated customer and returns order lines, fulfillment status, forwarding package details, both shipment legs, and events.
- `/api/addresses` supports customer-owned Georgian destination addresses; country is fixed server-side to `GE`. Admin routes list hybrid fulfillments, audit allowed state transitions, and record EU package receipt/customs status. Actual receipt reference must be entered by an administrator. There is no automation that submits supplier orders.
- Important boundary: current checkout order creation still does not bind a selected verified shipping quote to each order line, create an `eurofy_order_fulfillments` row, or reserve stock. The new APIs therefore provide operational records and foundations, but do not complete an end-to-end hybrid checkout. Admin package receipt cannot create a missing fulfillment.
