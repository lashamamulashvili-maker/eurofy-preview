# EUROFY.ge — architecture and implementation map

## Environments
- Preview: existing Render static site, public, demo products and browser-only demo orders.
- API: a separate Render Node.js/Express service is configured to deploy the `main` branch from `backend/`. Its live health and schema state have not been verified in this audit.
- Database: a Render PostgreSQL instance exists on the free plan; its reported expiry is 15 December 2026. Connection, schema state, backups, and retention were not verified.
- Production: separate service, domain and credentials; do not reuse Preview for payments.

## Modules
| Module | Frontend | API / database | External dependency |
|---|---|---|---|
| Homepage and catalog | Demo working | Products/categories schema and GET /api/products | Authorized real product feed |
| Search/filter/sort | Working on demo catalog | Public catalog query future | None |
| Product detail and cart | Demo working | Orders/items schema | None |
| Registration/login | Not connected | API registration/login and hashed opaque sessions in source | Email delivery/verification; security review |
| Customer account/orders | Demo orders only | Profile and unpaid order endpoints in source | Auth frontend and integration tests |
| Admin | Source exists, not connected to storefront | Admin product, category, pricing, order, and manual supplier-feed routes | Audit log, controlled role assignment, integration tests |
| Supplier purchases | Draft only | Offline offer/pricing helper; API supplier-purchase table | Supplier rights and API credentials; owner-approved purchase flow |
| Hybrid routes | Domain logic implemented, not connected | Direct dropship vs EU forwarding assessment and status guard; additive schema migration tested in PGlite | Supplier permissions, verified route costs/ETA, API integration |
| Warehouse | Planned | Shipments schema | Actual warehouse operations |
| Georgia shipping | Planned | Shipment fields | Carrier contract and rates |
| Payment | Disabled | payment_status unpaid | Provider contract and webhooks |
| Notifications | Planned | Event pipeline to add | Email provider |
| Legal pages | Placeholder only | N/A | Verified business/legal details |

## Security boundaries
Never trust browser totals, status changes, prices or admin claims.
No real payment should be accepted without webhook signature validation, idempotency and fulfillment controls.
Admin privileges must only be assigned server-side after identity verification.
Do not use the public demo checkout for actual personal data.
Never put database credentials or payment secrets into static HTML or git.

## Build order
1. Complete static UX and responsive testing.
2. Provision separate database, run migrations, deploy API to staging.
3. Implement auth frontend, email verification and recovery.
4. Implement admin product/category/order CRUD with authorization and audit logging.
5. Integrate order checkout, inventory, addresses and shipping quotes.
6. Add supplier purchase and warehouse flows.
7. Add payment provider sandbox with verified webhooks.
8. Add legal documents, GDPR workflows, operational monitoring and backups.
9. Perform end-to-end and security testing.
10. Enable production domain and live payments only after owner approval.
