# EUROFY next steps

Prioritize work in this order. Items requiring a contract, account credential, fee, legal decision, or owner-controlled local machine remain blocked until those inputs exist.

1. **Verify and back up the database.** The Render database is available/free and reported to expire 15 December 2026, but its empty IP allowlist blocks this environment. Confirm a backup and restore path from an authorized connection before expiry; do not open the database to this runner just to apply migrations.
2. **Integrate hybrid services into the API.** Persist supplier records, route assessments, order fulfillment transitions, audit events, and shipment legs with transaction boundaries and idempotency. Keep payment/provider and supplier submission actions disabled.
3. **Make the catalog real.** Require explicit per-product resale authorization, current inventory evidence, licensed images, a verified retail price, and destination route eligibility before publishing. Existing catalog rows remain demo.
4. **Connect customer functions.** Add persistent addresses and cart endpoints, server-priced unpaid development orders, order history, cancellation requests, and delivery tracking. Do not accept client totals or persist bearer tokens in browser localStorage.
5. **Build mock supplier adapters.** Define the Syncee adapter against mocks and written documentation only. Keep Outlet46 manual-only; no scraping.
6. **Complete customer/admin tests.** Add API/database transaction tests, role/authorization coverage, duplicate/idempotency checks, mock-only E2E checkout, and responsive/accessibility tests.
7. **Resolve external launch dependencies.** Obtain supplier resale/media rights, explicit Georgia direct-ship and EU-export terms, verified forwarding/carrier rates, an appropriate payment provider, and professional German/EU and Georgian legal/tax/customs review.
8. **Owner review on target computer.** Reconcile the development branch with any local changes, inspect the approved banner/logo on devices, verify a database backup/restore, and use the release review procedure before any later production decision.
