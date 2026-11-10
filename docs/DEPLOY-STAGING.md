# Deploy EUROFY staging later, from a computer

The existing public Render static site is **not** the API. Do not attach real customer data to it.

## 1. PostgreSQL
- In Render create a dedicated PostgreSQL instance named for EUROFY staging.
- Choose retention, billing and backups deliberately.
- Copy its **internal** database URL into the separate API service's DATABASE_URL environment variable. Do not commit it.
- Execute database/schema.sql and optionally database/seed-categories.sql against that database.
- Never run these scripts against JABSOFIA or any other existing database.

## 2. Backend web service
- New Render Web Service connected to `lashamamulashvili-maker/eurofy-preview`, branch `main`.
- Root directory: `backend`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Required environment variables: DATABASE_URL and ALLOWED_ORIGINS.
- Set ALLOWED_ORIGINS to the exact origin(s) that should access the API, comma separated; do not use wildcard.
- Set PGSSLMODE=require only when supported by the database certificate and connection mode.
- Confirm `GET /api/health` returns `databaseConfigured: true`; test database-backed endpoints too.

## 3. Admin
- Admin UI source: `admin.html` on the static preview.
- The current admin UI uses in-memory bearer tokens and does not persist them.
- Configure allowed origin for the static preview if using admin UI there.
- No public self-registration path may grant admin rights. Assign admin only through a controlled, audited owner operation after identity verification.
- Staging API must be secured and reviewed before using actual user information.

## 4. Before production
- Implement email verification, account recovery, full admin audit logs, backups and monitoring.
- Implement payment-provider signed webhooks, idempotency, refunds, shipping and taxes.
- Validate CORS, security headers, error handling, session expiry, user privacy and consent.
- Add automated integration and end-to-end tests. The current syntax workflow is not a full test suite.
- Get owner's explicit approval before enabling real payments.

## 5. Current status
The API is **not deployed**. Public storefront is a demo with illustrative products and local browser orders. No real payments, purchases, shipping or tracking.
