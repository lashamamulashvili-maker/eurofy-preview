# EUROFY backend — development foundation

**Status: development foundation.** Render reports a separate API service configured from `main`, but API health, database connection, schema state, and secrets were not verified in the 16 November 2026 audit. The static storefront remains a separate preview and is not connected to the API. No live payments or shipments.

## Implemented in source
- PostgreSQL tables: users, categories, products, orders, items, sessions, supplier purchases, shipments
- Active products listing
- Customer registration with bcrypt password hashing
- Login, 7-day opaque bearer sessions (SHA-256 digests in database), profile, logout
- Authenticated order creation with server-side product prices and transactional item writes
- Customer order history and admin-only order listing
- Orders are explicitly **unpaid**; no payment or shipment is initiated
- Request size limits, basic input validation, rate limits, security headers, parameterized queries

## Local setup
1. Install Node.js 20+ and PostgreSQL.
2. Create a dedicated empty local database and apply `database/schema.sql` from the repository root: `createdb eurofy_local` then `psql postgresql://localhost/eurofy_local -v ON_ERROR_STOP=1 -f database/schema.sql`.
3. In `backend/`, run `npm install` and `npm test`.
4. Set `DATABASE_URL` to the local database URL, then run `npm start`. Stop it with Ctrl+C.
5. Check `GET /api/health` and `GET /api/products` against local data.

## Local backup and restore check

Run these from the repository root with a local `DATABASE_URL`; keep backup files out of Git and do not use a production URL here:

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
- Add order idempotency, inventory locking, shipping pricing and fulfillment workflows.
- Run automated tests, vulnerability review, and full end-to-end QA before accepting real customer data.

The current API is a development foundation, not production-ready ecommerce.
