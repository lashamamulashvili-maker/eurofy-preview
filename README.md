# EUROFY.ge

Georgian-language European product storefront.

## Current deployment
Static mobile-friendly demo: https://eurofy-preview.onrender.com

The demo uses illustrative Unsplash images and prices. Its cart and orders use browser localStorage. No real purchases, payment, fulfillment or customer accounts.

## Structure
- `index.html` — public storefront demo (standalone static file)
- `backend/` — Node.js/Express API foundation (not deployed)
- `database/schema.sql` — PostgreSQL database schema (not provisioned)
- `docs/ARCHITECTURE.md` — technical plan, boundaries, implementation stages
- `docs/OWNER-CHECKLIST.md` — actions requiring owner access, decisions or contracts
- `robots.txt` — block search engine indexing of preview

## Local preview and API

The current storefront is a standalone demo page. From the repository root, start it with `python3 -m http.server 8080`, then open `http://localhost:8080`; stop it with Ctrl+C. This serves the demo UI only and does not connect it to the API.

For the local database-backed API, follow [`backend/README.md`](backend/README.md). From `backend/`, run `npm install`, `npm test`, then set a local-only `DATABASE_URL` and run `npm start`. Database setup, migration, backup, and restore commands are documented there. Do not use production secrets in the local environment.

## Safety
Do not submit real personal data to demo checkout.
Do not activate live payments without server-side payment verification, provider contract, legal review and tests.
Do not modify unrelated projects in the Render workspace.
