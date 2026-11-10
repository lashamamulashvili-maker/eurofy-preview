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

## Safety
Do not submit real personal data to demo checkout.
Do not activate live payments without server-side payment verification, provider contract, legal review and tests.
Do not modify unrelated projects in the Render workspace.
