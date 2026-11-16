# Owner setup checklist — do later on computer

These items need owner credentials, contracts or decisions. They are **not completed**.

- [ ] Confirm EUROFY legal business entity, country of establishment, business address and customer support contacts.
- [ ] Decide consumer terms, returns, customs/VAT, duties, shipping regions and estimated delivery time with appropriate professional advice.
- [ ] Obtain and connect EUROFY.ge domain; set DNS.
- [ ] Review existing Render API and PostgreSQL resources, confirm service health/schema/connection, and choose a retention/backup plan. The current free database is reported to expire on 15 December 2026.
- [ ] Confirm server-only DATABASE_URL, exact API origins and secure secrets in Render settings without exposing secret values.
- [ ] Select verified email delivery service and sender domain for transactional messages.
- [ ] Open merchant account with payment provider supporting Georgia; obtain test credentials first.
- [ ] Obtain supplier API/merchant permissions where available (Amazon/eBay etc.). Never scrape accounts in violation of terms.
- [ ] Decide Germany warehouse location and operational workflow.
- [ ] Contract Georgia shipping carrier and obtain shipping/tariff/tracking documentation.
- [ ] Provide approved actual product catalog, images, stock and retail prices.
- [ ] Review privacy, cookie, terms, return policy, and compliance before launch.
- [ ] Run real-device acceptance tests and authorize production release.

## What is already available
- GitHub repo: https://github.com/lashamamulashvili-maker/eurofy-preview
- Public demo: https://eurofy-preview.onrender.com
- Render reports a public static preview, a separate API web service, and a free PostgreSQL instance. Their runtime health, database connection/schema, and backup status still require verification.
- Both EUROFY Render services currently deploy from `main`; the isolated feature branch is not their configured source branch.
