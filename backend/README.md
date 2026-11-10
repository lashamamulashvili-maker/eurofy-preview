# EUROFY backend foundation

This backend is NOT deployed and is NOT connected to the public preview.

## Implemented
- PostgreSQL schema for users, products, orders, order items, supplier purchases and shipments
- API health check, public active-products listing, and password-hashed registration
- Basic security headers, input validation, rate limiting and parameterized SQL

## Before public launch
- Provision persistent PostgreSQL, run database/schema.sql, configure DATABASE_URL
- Add verified email, login/session management, CSRF protections if cookie auth is used, admin authorization, password resets and account recovery
- Add server-side order pricing, transactional checkout, inventory and payment verification
- Configure strict CORS/origin policy, secrets, logs, backups, privacy policy and security review
- Do not connect public checkout to this incomplete API
