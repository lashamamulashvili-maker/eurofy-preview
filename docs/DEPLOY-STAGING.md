# EUROFY Render staging notes

**Read-only configuration audit: 16 November 2026. No Render settings were changed.**

Render currently reports these EUROFY resources in the connected workspace:

- `eurofy-preview`: public static site, repository `lashamamulashvili-maker/eurofy-preview`, branch `main`, automatic deploy on commit, publish path `.`.
- `eurofy-api-preview`: Node web service, same repository and `main` branch, automatic deploy on commit, root directory empty, build command `cd backend && npm install --omit=dev`, start command `cd backend && npm start`, free Frankfurt plan.
- `eurofy-preview-db`: available free PostgreSQL instance in Frankfurt; reported expiry 15 December 2026.

This records Render configuration only. It does not establish that the API is healthy, the database is connected, the schema has been applied, backups exist, or environment variables are correct. Secret values were not inspected. The existing Render services point at `main`, not `feature/eurofy-dropshipping-foundation`; changes on the feature branch do not deploy to them automatically.

## Local API

1. Install Node.js 20+ and PostgreSQL.
2. Create a dedicated local EUROFY database; do not reuse any other project database.
3. Apply `database/schema.sql` to the empty local database. The file is currently an idempotent schema/bootstrap script, not an ordered migration system.
4. Copy `backend/.env.example` to a local ignored `.env` file and set a local `DATABASE_URL`. Never use or commit production credentials.
5. From `backend/`, run `npm install`, `npm test`, then `npm start`.
6. Check `GET /api/health` and the database-backed product/category endpoints against local data.

## Staging review before any changes

1. Confirm database owner, data contents, retention, expiry, and verified backup/restore procedure.
2. Check whether the Render API's environment settings are complete without exposing secret values; confirm the exact allowed origins.
3. Verify schema version, service health, deployment history, and logs using the Render dashboard.
4. Keep the app on mock suppliers and unpaid orders. Do not add a payment provider, submit a supplier purchase, or expose real customer data.
5. Do not change service branches, trigger a deployment, create paid resources, or alter the public site without the owner's separate approval for that action.

The current feature branch is local to development; preserve its source and review it before deciding whether a later staging deployment is appropriate.
