# EUROFY development progress

## 16 November 2026 — isolated feature-branch audit

- Repository: `lashamamulashvili-maker/eurofy-preview`.
- Working branch: `feature/eurofy-dropshipping-foundation`.
- Starting commit: `ab44d9f125cfc6026f4fddbf6eafde76938f79cb`.
- The feature branch started clean and contains the previously approved storefront work plus the offline dropshipping foundation. `main` was fetched for comparison and is the common parent at `3e8ba54`.
- A timestamped archive of the checkout including `.git` was created and verified before edits: `backups/eurofy-before-20261116T161940Z.tar.gz` (SHA-256 `e6811f893f44aac60874ab002b244284280d813c728b05ee735851b78a241d00`).
- Existing focused tests initially passed: 6/6. After extending the pricing tests, `npm test` passes 11/11.
- Improvement: price conversion and gross-margin rounding now use `BigInt` intermediate arithmetic, reject values that cannot be represented safely in integer minor units, and have regression tests. `backend/package.json` now exposes the test command.
- The static storefront remains explicitly marked as a preview and still uses illustrative products, browser-local cart/orders, and no live checkout. The backend source contains registration/login, profile, order, admin, and manual supplier-feed routes, but those routes are not wired into the storefront.
- Render configuration was inspected read-only. The public static service and the API service both point at `main` with automatic deploy on commit. The API service is configured to install/start from `backend/`, on the free Frankfurt plan. A free PostgreSQL instance is available and currently has an expiry date of 15 December 2026. Runtime health, database schema state, and secret values were not inspected or changed.
- This environment had no pre-existing EUROFY checkout at the user's Windows/Mac path. Work is being carried out in an isolated Linux clone; no claim is made that the owner's computer has received these changes.

## Current boundary

No payment provider, real supplier order, customer charge, supplier API activation, or production deployment was made. The source is still a development foundation and is not production-ready. See [RELEASE-READINESS.md](RELEASE-READINESS.md) and [NEXT-STEPS.md](NEXT-STEPS.md).

## 16 November 2026 — Mission 2 hybrid foundation

- Re-verified the feature branch at `93bd277102db774f090023b8e1e5f83da5fc395c`, clean and aligned with `origin` before edits. Existing tests passed 11/11.
- Created and verified pre-edit archive `/workspace/scratch/backups/eurofy-mission2-before-20261116T163747Z.tar.gz` (SHA-256 `49a58e5cfbc49e699560fdc5fe1490047c39b961a9a6132da37fa8a85da27cac`).
- Re-checked Render PostgreSQL `eurofy-preview-db`: available, free plan, PostgreSQL 17, reported expiry 15 December 2026. Its IP allowlist is empty, which prevents the hosted read-only query tool from reaching it. No allowlist or service changes were made, and no schema/data/backup status could be inspected.
- Added a tested hybrid-route evaluator, permission-aware route comparison, manual override audit record, fulfillment transition guard, additive database migration, and local-only migration runner. The migration defaults existing products to `demo` and does not delete or rewrite existing rows.
- Added PGlite as a pinned development-only dependency, migration tests, and a transactional fulfillment repository with idempotent order-line creation and audit-backed state changes. Supplier submission remains disabled. Current result: `npm test` passes 29/29, including route/state, migration, and fulfillment persistence tests. A missing selected price-history timestamp was exposed and fixed. Evidence freshness is bounded (cost 24h, FX 72h, ETA 7d); inventory reservation prevents concurrent over-allocation. Syntax checks and `git diff --check` pass.
- Remaining gap: the API routes and storefront do not yet call the hybrid repository/domain module. The migration has not been run against Render or any owner-controlled database.

See [HYBRID-FULFILLMENT.md](HYBRID-FULFILLMENT.md) for the implementation plan and boundaries.
