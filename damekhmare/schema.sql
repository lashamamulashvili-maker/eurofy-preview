-- DAMEKHMARE marketplace schema, additive and isolated from legacy EUROFY.
-- Apply to a NEW local development PostgreSQL database first.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS dm_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 display_name text NOT NULL,
 role_customer boolean NOT NULL DEFAULT true,
 role_provider boolean NOT NULL DEFAULT false,
 locale text NOT NULL DEFAULT 'ka' CHECK(locale IN ('ka','en','ru')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE,
 title_ka text NOT NULL,
 title_en text NOT NULL,
 title_ru text NOT NULL,
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS dm_provider_profiles (
 account_id uuid PRIMARY KEY REFERENCES dm_accounts(id) ON DELETE CASCADE,
 bio text NOT NULL DEFAULT '',
 city text NOT NULL,
 service_area text NOT NULL DEFAULT '',
 verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_provider_services (
 provider_id uuid NOT NULL REFERENCES dm_provider_profiles(account_id) ON DELETE CASCADE,
 category_id uuid NOT NULL REFERENCES dm_categories(id),
 price_from_gel_minor integer CHECK(price_from_gel_minor>=0),
 PRIMARY KEY(provider_id,category_id)
);
CREATE TABLE IF NOT EXISTS dm_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES dm_accounts(id),
 category_id uuid NOT NULL REFERENCES dm_categories(id),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 4000),
 city text NOT NULL,
 address_private text,
 remote_allowed boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES dm_requests(id) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES dm_provider_profiles(account_id),
 amount_gel_minor integer NOT NULL CHECK(amount_gel_minor>=0),
 note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,provider_id)
);
CREATE TABLE IF NOT EXISTS dm_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 offer_id uuid NOT NULL UNIQUE REFERENCES dm_offers(id),
 scheduled_for timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES dm_bookings(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES dm_accounts(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL UNIQUE REFERENCES dm_bookings(id),
 author_id uuid NOT NULL REFERENCES dm_accounts(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid REFERENCES dm_accounts(id),
 action text NOT NULL,
 subject_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_requests_category_city_idx ON dm_requests(category_id,city,created_at DESC);
CREATE INDEX IF NOT EXISTS dm_offers_request_idx ON dm_offers(request_id);
CREATE INDEX IF NOT EXISTS dm_messages_booking_idx ON dm_messages(booking_id,created_at);
-- Access to private addresses, messages and offers MUST be checked by server-side
-- authorization before adding API routes. Never expose these tables via public queries.
