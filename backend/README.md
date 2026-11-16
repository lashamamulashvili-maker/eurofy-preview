# EUROFY backend — development foundation

**Status: local development application, not production-ready.** The local Express app can serve the storefront and API from one origin using embedded PGlite storage. The public Render preview remains static and disconnected; production is untouched. No live payments or shipments.

## Implemented in source
- PostgreSQL tables: users, categories, products, orders, items, sessions, supplier purchases, shipments
- Verified catalog API with search/category filters; published listings require enabled supplier resale authorization, fresh stock and price evidence, separate Georgia shipping permission, and verified image licensing
- Customer registration with bcrypt password hashing
- Login, 7-day opaque bearer sessions (SHA-256 digests in database), profile, logout
- Authenticated order creation with server-side product prices and transactional item writes
- Customer order history and admin-only order listing
- Persistent authenticated carts, server-side eligibility/stock checks, and idempotent unpaid order requests; no payment or supplier shipment is initiated
- Request size limits, basic input validation, rate limits, security headers, parameterized queries
- Offline hybrid-route evaluation, fulfillment transition validation, and transactional reservation repository; supplier order submission remains blocked
- Authenticated customer-owned Georgian address book, order details with fulfillment/parcel/shipment-event summaries, local-PGlite-only mock payment evidence, and admin-only hybrid fulfillment list/transition/package receipt APIs
- Additive hybrid schema migrations, checksum-tracked local migration runner, and idempotent unpaid order requests
- Local PGlite database stores persistent development data; integration tests exercise real HTTP catalog, auth, cart, and unpaid order-request paths. Render has not been changed

## Local setup (recommended: embedded PGlite)
1. Install Node.js 20+.
2. From `backend/`, run `npm ci`.
3. Initialize the local database and additive migrations with `npm run migrate:pglite`. The database lives in the ignored repository-root `.eurofy-data/` directory.
4. Run `npm test`.
5. Start the storefront and API together with `npm run dev:local`; open `http://localhost:3000`. Stop with Ctrl+C.
6. Confirm `/api/health` reports database connected. The catalog is empty until an administrator adds fully authorized offers with verified rights and current stock/price evidence.

## Standard local PostgreSQL alternative
Create a dedicated local database, apply `database/schema.sql` from the repository root, set loopback-only `DATABASE_URL`, then run `npm run migrate:local` from `backend/`. The migration runner rejects non-loopback hosts. Start the API with `npm start`; `npm run dev:local` is specifically configured for PGlite mode.

## Local backup and restore

Owner-oriented macOS source setup, safe restore commands, backup instructions, and the current machine-access boundary are in [`../docs/MACOS-RESTORE.md`](../docs/MACOS-RESTORE.md).

For embedded PGlite, stop the app first, then from the repository root run `mkdir -p backups && tar -czf backups/eurofy-pglite-$(date -u +%Y%m%dT%H%M%SZ).tar.gz .eurofy-data && gzip -t backups/eurofy-pglite-*.tar.gz`. To verify recovery, extract one archive to a new directory with `mkdir -p /tmp/eurofy-restore && tar -xzf backups/ARCHIVE.tar.gz -C /tmp/eurofy-restore`, then run `EUROFY_LOCAL_DB_DIR=/tmp/eurofy-restore/.eurofy-data node backend/migrate.js --pglite`; it should report migrations skipped after checksum validation. Do not extract over the primary local database.

For standard local PostgreSQL, run the following from the repository root with a loopback `DATABASE_URL`; keep backup files out of Git:

```sh
mkdir -p backups
pg_dump --format=custom --no-owner --file="backups/eurofy-local-$(date +%Y%m%d-%H%M%S).dump" "$DATABASE_URL"
createdb eurofy_restore_check
pg_restore --no-owner --dbname=eurofy_restore_check backups/eurofy-local-YYYYMMDD-HHMMSS.dump
```

Replace the final filename with the dump just created. Verify the restored database before relying on the backup. The restore example uses a separate database so it does not overwrite the source; the current project does not yet automate or schedule backups.

## Required before public deployment
- Deploy backend as a separate private-configured Render web service with a persistent database.
- Configure strict origin/CORS rules, TLS, environment secrets, database backups, monitoring and migrations.
- Add email verification, password recovery, session rotation, token revocation and abuse protections.
- Complete secure browser authentication (avoid localStorage token persistence), admin workflows and audit logs.
- Verify legal, privacy, tax, customs, returns and delivery requirements.
- Integrate payment provider webhooks with signature validation and idempotency; **never** mark paid based on browser input.
- Connect verified route quotes to checkout; create order fulfillments and inventory reservations transactionally before payment verification.
- Finish Ukrainian coverage; current language choice and core text are translated but help/legal/catalog/validation/admin coverage is partial.
- Add browser-driven desktop/mobile checkout, accessibility checks, and admin endpoint workflows.
- Run automated tests, vulnerability review, and full end-to-end QA before accepting real customer data.

The current API is a development foundation, not production-ready ecommerce.
