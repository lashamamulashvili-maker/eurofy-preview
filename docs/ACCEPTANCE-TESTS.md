# EUROFY acceptance test plan

## Static preview (test now)
- [ ] iPhone 375px, 390px, 430px: no horizontal scrolling; two-column products; legible nav.
- [ ] Tablet 768px and desktop 1440px: images crop consistently, text remains readable.
- [ ] Catalog category filters, search and price sorting produce correct results.
- [ ] Product details open, add to cart, remove from cart, checkout demo.
- [ ] Demo checkout clearly warns to use fake details and creates no real purchase.
- [ ] Demo orders persist in same browser, not across devices.
- [ ] Wishlist add/remove works and persists locally.
- [ ] FAQ, shipping info and legal placeholder pages open.
- [ ] Preview robots.txt disallows indexing.

## Backend staging (after owner provisioning)
- [ ] Database schema runs successfully on empty PostgreSQL.
- [ ] Health and product endpoints return expected responses.
- [ ] Registration rejects invalid input and duplicates.
- [ ] Login rejects invalid passwords; logout revokes token.
- [ ] Customer cannot read another customer's orders.
- [ ] Non-admin cannot access admin endpoints.
- [ ] Product create/update validates price, URL, category, SKU.
- [ ] Order totals calculated server-side; tampered client prices ignored.
- [ ] Unpaid orders never trigger supplier purchase or shipping.
- [ ] Concurrency, duplicate requests and retry behavior reviewed.
- [ ] Database backups and restore drill completed.

## Launch gates
- [ ] Approved legal policies and support contact details.
- [ ] Verified email flows, privacy handling and account deletion.
- [ ] Payment provider sandbox webhooks validated and idempotent.
- [ ] Shipping/tax/customs calculations verified with actual providers.
- [ ] Security review and production monitoring.
- [ ] Owner explicitly approves live payments.
