# EUROFY.ge

Georgian-language European product storefront.

## Current deployment
Public preview: https://eurofy-preview.onrender.com. It remains a static preview and is not connected to the development database or the API branch. Do not use it for real orders or personal data.

The local app serves the existing EUROFY design and approved family banner from the same origin as its development API. The purchase catalog only shows published products with current stock/price evidence, resale authorization, Georgia route permission, and verified image licensing; an empty catalog is expected until these checks are populated.

## Structure
- `index.html` — Georgian storefront connected to local catalog, account, cart, and unpaid order-request APIs
- `backend/` — Node.js/Express API foundation (not deployed)
- `database/schema.sql` — PostgreSQL database schema (not provisioned)
- `docs/ARCHITECTURE.md` — technical plan, boundaries, implementation stages
- `docs/OWNER-CHECKLIST.md` — actions requiring owner access, decisions or contracts
- `robots.txt` — block search engine indexing of preview

## Local preview and API

For the persistent embedded PostgreSQL-compatible local app, follow [`backend/README.md`](backend/README.md). From `backend/`, run `npm ci`, `npm test`, `npm run migrate:pglite`, and `npm run dev:local`; open `http://localhost:3000`. Stop with Ctrl+C. Local data is stored in the ignored `.eurofy-data/` directory. A standard local PostgreSQL server can also be used with the loopback-only migration command documented in the backend guide.

## Safety
Do not submit real personal data to demo checkout.
Do not activate live payments without server-side payment verification, provider contract, legal review and tests.
Do not modify unrelated projects in the Render workspace.
