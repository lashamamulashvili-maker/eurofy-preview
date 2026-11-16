# DAMEKHMARE — design v2 development track

This feature branch preserves the EUROFY storefront and its `main` branch.

## Implemented
- `damekhmare/index.html`: standalone responsive visual prototype.
- Georgian (default), English, Russian UI labels with persisted locale selection.
- Searchable service categories; no personal information is stored.
- `damekhmare/schema.sql`: additive PostgreSQL data model for marketplace development.

## Not implemented / do not claim operational
Authentication, provider verification, matching, service requests, offers, bookings,
chat, subscriptions, payment, moderation, legal notices, notifications, and real
city-based search are **not** connected to the UI. Buttons for account actions
explicitly state they are unavailable.

## Architecture decision
Use a separate marketplace namespace and new local development database.
Do not repurpose the existing EUROFY product, order or shipment tables.
Preserve the original backend and all user data.

## Commercial rules
Browsing and registration free; 20 GEL/month per personal account for paid
interaction capabilities, including accounts using both customer and provider roles.
No commission. Real billing disabled until separate owner authorization.
Renewal must be opt-in; test subscription states are not payments.

## Next implementation sequence
1. Build an isolated Express marketplace router with schema validation, auth,
   server-side authorization, role checks, and integration tests.
2. Build provider/customer onboarding and request/offer workflows.
3. Add booking and participant-only messaging, verified reviews, admin moderation.
4. Add subscription entitlement checks using mock payment state only.
5. Run PostgreSQL migration and API tests against disposable local test DB.
6. Complete accessibility, three-locale, responsive and browser acceptance tests.

## Security
No private address, contact, chat, verification document or bank data in
public responses. Do not use localStorage for access tokens. Audit sensitive
operations. Never publish test data or credentials.
