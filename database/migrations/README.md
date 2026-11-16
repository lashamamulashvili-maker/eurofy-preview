# EUROFY database migrations

`schema.sql` remains the initial bootstrap for a new EUROFY database. Incremental changes go in zero-padded, versioned `.sql` files in this directory. Never edit an applied migration: the runner stores a SHA-256 checksum and refuses modified history.

For local development only:

1. Initialize an empty, dedicated local database with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql`.
2. From `backend/`, set `DATABASE_URL` to a loopback PostgreSQL database (`localhost`, `127.0.0.1`, or `::1`).
3. Run `npm run migrate:local`.
4. Run `npm test`.

The migration runner requires an explicit `--local` flag and rejects non-loopback database hosts. It is never run automatically by the API server. Migration files are applied transactionally, in filename order, with a transaction-scoped advisory lock. A failed migration is rolled back and not recorded as applied.

This workflow has been exercised against PGlite's embedded PostgreSQL engine in tests. The Render database remains untouched; its network allowlist prevents this environment from inspecting its existing schema or data.
