# EUROFY — dropshipping implementation checkpoint

## Intended workflow
EUROFY sells products to customers in Georgia, purchases goods from an authorized European supplier after a valid customer order, receives goods at an EU forwarding address where applicable, and arranges onward shipment to Georgia. Direct supplier-to-Georgia fulfillment is an optional alternative only when confirmed by the supplier.

## Supplier evidence (16 November 2026)
- Syncee support reports that its custom-store API is available only after manual enablement by its team. EUROFY's URL must be shared for review. API availability does not establish pricing, shipping to Georgia, supplier authorization, or fulfillment eligibility.
- Outlet46 confirms delivery to an EU address; VAT is charged absent a valid EU VAT number. It does not provide API, CSV/XML feeds, or automated stock/price synchronization, so it is not suitable for automatic catalog sync.
- Do not reuse product imagery without explicit license. AI editing does not itself grant reuse rights.

## New offline foundation
`backend/dropshipping.js` provides supplier offer validation, indicative landed-cost/margin calculation, and a draft supplier-order state that **cannot purchase anything**. Run `node --test backend/dropshipping.test.js` using Node 20+.

## Critical remaining work
1. Confirm written supplier resale and image/catalog rights, eligible destinations, shipping rates, stock feeds, return handling, and API subscription costs.
2. Build authenticated internal supplier catalog ingestion and database schema with versioned stock/price snapshots; block unauthorized or unverified listings.
3. Add explicit order state machine: customer_order_received → payment_verified → supplier_order_review → supplier_order_placed → supplier_shipped → EU_received (when forwarding) → export/customs → delivered / return.
4. Implement idempotent payment webhooks only after owner-approved provider integration and legal review. Never mark orders paid from client input.
5. Build shipping/customs estimates, VAT/tax treatment, consumer-rights disclosures, refund policy, and privacy compliance with qualified professional review.
6. Add supplier API adapters in sandbox/mock mode, stock checks at checkout, shipment tracking, refund flows, and end-to-end tests.
7. Reconcile live storefront vs database-backed API: current preview has illustrative products and browser-local cart; do not represent these as purchasable inventory.

## Deployment boundary
No paid subscription, supplier API enablement, real order, public production changes, or payments authorized by this checkpoint. Changes belong to the isolated feature branch until reviewed and tested.
