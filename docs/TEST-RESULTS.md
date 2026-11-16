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
