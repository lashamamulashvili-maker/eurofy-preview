# EUROFY — dropshipping implementation checkpoint

## Intended workflow
EUROFY sells products to customers in Georgia, purchases goods from an authorized European supplier after a valid customer order, receives goods at an EU forwarding address where applicable, and arranges onward shipment to Georgia. Direct supplier-to-Georgia fulfillment is an optional alternative only when confirmed by the supplier.

## Supplier evidence (16 November 2026)
- Syncee support reports that its custom-store API is available only after manual enablement by its team. EUROFY's URL must be shared for review. API availability does not establish pricing, shipping to Georgia, supplier authorization, or fulfillment eligibility.
- Outlet46 confirms delivery to an EU address; VAT is charged absent a valid EU VAT number. It does not provide API, CSV/XML feeds, or automated stock/price synchronization, so it is not suitable for automatic catalog sync.
- Do not reuse product imagery without explicit license. AI editing does not itself grant reuse rights.

## Offline foundations
- `backend/dropshipping.js` validates supplier offers, computes indicative quotes, and prepares a draft supplier order that cannot purchase anything.
- `backend/hybrid-fulfillment.js` evaluates direct-to-Georgia and EU-forwarding permissions, cost evidence, ETA, automatic recommendations, manual overrides, and transition guards.
- `database/migrations/20261116_001_hybrid_fulfillment.sql` adds the hybrid storage schema without deleting existing rows; existing products default to `demo`.
- `backend/migrate.js` only applies migrations to loopback PostgreSQL when explicitly run with `npm run migrate:local`.
- Run `npm test` from `backend/`. Tests include embedded PostgreSQL migration checks. The Render migration has not been applied.

## Critical remaining work
1. Confirm written supplier resale and image/catalog rights, eligible destinations, shipping rates, stock feeds, return handling, and API subscription costs.
2. Integrate authenticated supplier catalog ingestion and the new schema with versioned stock/price snapshots; block unauthorized or unverified listings.
3. Connect the tested transition guard and two route models to transactional order APIs and shipment events.
4. Implement idempotent payment webhooks only after owner-approved provider integration and legal review. Never mark orders paid from client input.
5. Build shipping/customs estimates, VAT/tax treatment, consumer-rights disclosures, refund policy, and privacy compliance with qualified professional review.
6. Add supplier API adapters in sandbox/mock mode, stock checks at checkout, shipment tracking, refund flows, and end-to-end tests.
7. Reconcile live storefront vs database-backed API: current preview has illustrative products and browser-local cart; do not represent these as purchasable inventory.

## Deployment boundary
No paid subscription, supplier API enablement, real order, public production changes, or payments authorized by this checkpoint. Changes belong to the isolated feature branch until reviewed and tested.
