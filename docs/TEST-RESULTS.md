# EUROFY test results

## 16 November 2026

| Check | Result | Scope |
|---|---|---|
| Baseline `node --test backend/dropshipping.test.js` | PASS, 6/6 | Existing supplier-offer, quote, and draft-order tests before edits |
| `npm test` in `backend/` | PASS, 11/11 | Pricing and supplier foundation unit tests after edits |
| `node --check server.js` | PASS | JavaScript syntax only; dependencies/database are not exercised |
| `node --check dropshipping.js` | PASS | JavaScript syntax only |
| `git diff --check` | PASS | Whitespace and patch formatting |

The added tests cover resale authorization, separate image-rights tracking, integer minor-unit pricing, EUR/GEL ratio rounding, handling/customs inputs, unsafe amount overflow, malformed supplier currency, stock limits, invalid margin, and the guarantee that creating a supplier draft does not initiate payment or purchase.

## Not run / not verified

- No PostgreSQL client or local database was available in this environment; schema execution and database integration tests were not run.
- No frontend browser automation or mobile-device test suite exists in this branch, so visual, accessibility, and end-to-end checkout behavior were not verified.
- No real payment, supplier, shipment, email, or customs integration is connected or tested.
- The Render service configuration was read, but no live endpoint was called and no deployment was triggered.
- The only automated suite currently configured by `npm test` is `backend/dropshipping.test.js`; it is not a complete application test suite.

The npm process emitted an environment warning that `http-proxy` is an unknown npm configuration key. The test command still exited successfully.

## Mission 2 — 16 November 2026

| Check | Result | Scope |
|---|---|---|
| `npm test` in `backend/` | PASS, 29/29 | Existing supplier tests, hybrid route/state tests, PostgreSQL migration and fulfillment persistence tests |
| `node --check` for server and new modules | PASS | JavaScript syntax only |
| `git diff --check` | PASS | Patch formatting |

Migration tests use PGlite (embedded PostgreSQL) with the existing bootstrap schema and verify existing product rows remain intact, new route-specific tables/columns exist, rerunning a migration skips its checksum, modified applied SQL is rejected, failed SQL rolls back without being recorded, and non-loopback database URLs are rejected. Fulfillment repository tests verify one record per order/SKU, safe retries, authorization and live inventory checks, transactional audit events, payment evidence gating, and blocked supplier submission.

The hosted Render database could not be queried: its IP allowlist is empty and the hosted Render query tool has no allowlistable source IP. The migration was not applied to Render. No API/database end-to-end or browser checkout tests exist yet.

## Mission 3 — 16 November 2026

| Check | Result | Scope |
|---|---|---|
| `npm test` in `backend/` | PASS, 32/32 | Prior domain/migration/fulfillment tests, verified catalog/cart repository tests, and HTTP integration test for auth/catalog/cart/order idempotency |
| `npm run migrate:pglite` | PASS | Initialized local persistent PGlite database and applied both additive migrations; second run skipped both by checksum |
| Local HTTP smoke | PASS | `/api/health` 200, `/api/products` 200 with empty verified catalog, `/` and approved logo asset 200, unauthenticated `/api/cart` 401 |
| Frontend inline script `node --check` | PASS | Inline storefront JavaScript syntax |
| Backend `node --check` | PASS | Modified API, local database, migration and repository modules |
| `git diff --check` | PASS | Whitespace and patch formatting |

| Persistent database backup/restore | PASS | Archive verified with gzip; extracted to a separate temporary directory and reopened with both migration checksums present |

The integration test started an isolated temporary PGlite database and local HTTP API, seeded only test products with explicit mock supplier/image permissions, then verified catalog exposure, account registration and login, authenticated cart persistence, over-stock rejection, unpaid order creation, retry idempotency, conflict rejection for a reused key with changed data, and that no live payment flow is connected.

The persistent working development database is local under `.eurofy-data/` and is ignored by Git. Render was not queried or modified in this batch. No purchase, charge, public deployment, or supplier API call occurred.

The persistent `.eurofy-data/` archive was verified with `gzip -t`, restored into a separate temporary directory, reopened by PGlite, and checked for the users table and both recorded migrations. The source checkout backup and database backup are separate artifacts.
