# Local development — DAMEKHMARE

Requires Node.js 20+, npm, PostgreSQL 15+ for API/database integration.

The API is a separate service, not the existing EUROFY backend.
No live payments, production deployment or external paid APIs.

## Setup
1. Create a new disposable local PostgreSQL database for DAMEKHMARE.
2. Apply `damekhmare/schema.sql` and then `damekhmare/seed.sql`.
3. `cd damekhmare/api && npm install`
4. Set `DAMEKHMARE_DATABASE_URL` to the local database connection string.
5. Run `npm test`, then `npm start`.
6. Open `http://127.0.0.1:8002/preview/index.html` to view the separate design prototype.

Without a database, health and unauthenticated safety paths remain inspectable;
database-backed routes correctly return 503. This is not a production-ready app.

## API (development only)
- GET /api/health
- GET /api/categories
- POST /api/register
- POST /api/login
- GET /api/me (Bearer token)
- POST /api/logout (Bearer token)
- GET /api/requests?city=...
- POST /api/requests (Bearer token)

## Known limitations
Sessions are in process memory, not persistent. No email verification,
password recovery, role verification, subscription entitlements, bookings,
messaging, moderation, or production authorization audit yet.
Do not deploy this API publicly.
