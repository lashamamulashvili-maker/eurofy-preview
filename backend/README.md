# EUROFY backend — development foundation

**Status: code committed, NOT deployed, NOT connected to the public static preview.**
The public Render service remains a static storefront demo. No live payments or shipments.

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
2. Execute `database/schema.sql` on a dedicated empty database.
3. In `backend/`, run `npm install`.
4. Set `DATABASE_URL` as an environment variable, then `npm start`.
5. Test `GET /api/health` and `GET /api/products`.

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
