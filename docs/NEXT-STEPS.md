# EUROFY next steps

## Mission 4 verified checkpoint — 16 November 2026

Latest development branch work adds local mock payment evidence, customer address/order APIs, and admin hybrid package/status operations. 34 automated tests pass. The new UI language choices are Georgian, English, and Ukrainian, but translation coverage is partial; checkout route quote selection and fulfillment creation are still absent. No live payment, supplier order, or deployment is enabled.

Immediate next work:

1. Finish a customer-address and order-detail storefront UI that consumes the existing APIs.
2. Implement a verified quote publication/selection flow that derives supplier permissions from database records, then atomically creates fulfillment and inventory reservations for order lines. Keep supplier ordering disabled.
3. Connect admin state controls to the hybrid transition endpoint and forwarding package records; add positive and negative integration tests.
4. Complete Ukrainian translations and test every reachable string in catalog, forms, account, status, notifications, admin, and legal/help pages; preserve old Russian transactional text.
5. Add browser-based desktop/mobile checkout and accessibility tests.
6. Review persistent data-retention/backup policy; Mission 4 source and database checkpoints have been created and both database restores verified.
7. Confirm Syncee API enablement, legal resale/image rights, Georgia destinations, EU forwarding/export permission, actual quotes and fees, and provider payment evidence before considering commercial use.

Prioritize work in this order. Items requiring a contract, account credential, fee, legal decision, or owner-controlled local machine remain blocked until those inputs exist.

1. **Verify and back up the database.** The Render database is available/free and reported to expire 15 December 2026, but its empty IP allowlist blocks this environment. Confirm a backup and restore path from an authorized connection before expiry; do not open the database to this runner just to apply migrations.
2. **Integrate hybrid services into the API.** Persist supplier records, route assessments, order fulfillment transitions, audit events, and shipment legs with transaction boundaries and idempotency. Keep payment/provider and supplier submission actions disabled.
3. **Make the catalog real.** Require explicit per-product resale authorization, current inventory evidence, licensed images, a verified retail price, and destination route eligibility before publishing. Existing catalog rows remain demo.
4. **Connect customer functions.** Add persistent addresses and cart endpoints, server-priced unpaid development orders, order history, cancellation requests, and delivery tracking. Do not accept client totals or persist bearer tokens in browser localStorage.
5. **Build mock supplier adapters.** Define the Syncee adapter against mocks and written documentation only. Keep Outlet46 manual-only; no scraping.
6. **Complete customer/admin tests.** Add API/database transaction tests, role/authorization coverage, duplicate/idempotency checks, mock-only E2E checkout, and responsive/accessibility tests.
7. **Resolve external launch dependencies.** Obtain supplier resale/media rights, explicit Georgia direct-ship and EU-export terms, verified forwarding/carrier rates, an appropriate payment provider, and professional German/EU and Georgian legal/tax/customs review.
8. **Owner review on target computer.** Reconcile the development branch with any local changes, inspect the approved banner/logo on devices, verify a database backup/restore, and use the release review procedure before any later production decision.

## Mission 3 implementation status

1. Local persistent PGlite mode and same-origin storefront/API are available using the commands in `backend/README.md`.
2. Catalog API and authenticated cart are now connected and covered by repository plus HTTP integration tests. Only products with verified supplier, shipping, stock, price, and image-rights evidence can appear.
3. Development order requests are server-priced, idempotent, transactional, and always unpaid. They do not yet choose a shipping route or create fulfillment records.
4. Next implement quote-backed route selection and fulfillment creation with inventory reservations inside the order transaction; then customer shipment tracking and admin review actions.
5. Add address-book CRUD, customer order detail/cancellation paths, and tested admin supplier/product authorization screens.
6. Keep Syncee/API, supplier contracts, forwarding rates, payment service, legal review, and Render access blocked until separately authorized/available. Public preview remains static and production untouched.
