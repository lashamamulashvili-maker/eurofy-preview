# EUROFY.ge — architecture and implementation map

## Environments
- Preview: existing Render static site, public, demo products and browser-only demo orders.
- API: separate Node.js/Express service (source in backend/), **not deployed**.
- Database: PostgreSQL (schema in database/schema.sql), **not provisioned**.
- Production: separate service, domain and credentials; do not reuse Preview for payments.

## Modules
| Module | Frontend | API / database | External dependency |
|---|---|---|---|
| Homepage and catalog | Demo working | Products/categories schema and GET /api/products | Real product feed |
| Search/filter/sort | Working on demo catalog | Public catalog query future | None |
| Product detail and cart | Demo working | Orders/items schema | None |
| Registration/login | Not connected | Initial endpoints and sessions | Email delivery/verification |
| Customer account/orders | Demo orders only | GET /api/me, GET /api/my-orders | Auth frontend |
| Admin | Not connected | GET /api/admin/orders | Admin role assignment |
| Supplier purchases | Planned | Supplier purchase schema | Supplier credentials and allowed API |
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
