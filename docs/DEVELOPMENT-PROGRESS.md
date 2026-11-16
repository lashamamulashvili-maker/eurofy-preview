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
