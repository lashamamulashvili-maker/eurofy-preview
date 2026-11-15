# EUROFY order notifications — setup and limits

The backend now supports **optional server-side notification emails** after a persisted order request. No payment is collected and no supplier purchase is triggered.

## Configuration (Render API service environment, never public JavaScript)

- `RESEND_API_KEY`: secret API key for a configured transactional-email account.
- `ORDER_NOTIFICATION_FROM`: verified sender address/domain.
- `ORDER_NOTIFICATION_EMAIL`: owner inbox; can be changed later without code changes.

These variables are **not configured by this change**. Email is not active until a verified sender and provider account are set up and a test order is completed. Provider costs and terms require owner approval.

After an authenticated `POST /api/orders`, the API commits the order and tries to send an email containing the order number, buyer contact, delivery address, item quantities, prices, and stored supplier product URLs. The notification is best-effort; failure does **not** cancel the order. The API returns `notificationStatus: sent|pending` to indicate provider submission, not confirmed inbox delivery.

## Security and operational follow-up

- Keep keys in Render secret environment variables; never in GitHub, frontend files, or browser storage.
- Supplier links must come from verified supplier records. Do not send buyer personal details to supplier URLs.
- Before commercial launch: add durable email outbox/retry and idempotency, admin-editable recipient settings with reauthentication, audit logs, privacy/retention policies, a working checkout UI, and payment/legal compliance.
- Existing `admin.html` provides a backend-connected management interface but requires the API, database migrations, and an admin account. This PR does not deploy or turn on checkout.
- Exchange-rate endpoint exists in the backend. Automatic repricing on each exchange-rate update is **not yet implemented**.
