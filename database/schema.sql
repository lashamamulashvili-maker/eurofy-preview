-- EUROFY foundation (PostgreSQL). Not connected to the public preview yet.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 full_name text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '',
 city text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name_ka text NOT NULL UNIQUE,
 slug text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id uuid REFERENCES categories(id),
 title_ka text NOT NULL,
 description_ka text NOT NULL DEFAULT '',
 price_gel_minor integer NOT NULL CHECK (price_gel_minor >= 0),
 image_url text,
 sku text UNIQUE,
 is_active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_number text NOT NULL UNIQUE,
 user_id uuid REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','purchased','in_transit','delivered','cancelled')),
 total_gel_minor integer NOT NULL CHECK (total_gel_minor >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id uuid REFERENCES products(id),
 product_title_snapshot text NOT NULL,
 unit_price_gel_minor integer NOT NULL CHECK (unit_price_gel_minor >= 0),
 quantity integer NOT NULL CHECK (quantity > 0)
);
CREATE TABLE IF NOT EXISTS supplier_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 supplier text NOT NULL,
 supplier_order_number text,
 purchased_at timestamptz,
 note text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 supplier_purchase_id uuid REFERENCES supplier_purchases(id),
 carrier text,
 tracking_number text,
 warehouse_received_at timestamptz,
 shipped_to_georgia_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_tracking_idx ON shipments(tracking_number);

-- Server-managed opaque sessions; only SHA-256 token digests are stored.
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
-- Explicitly mark unpaid/test orders; no payment provider is connected.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
 CHECK (payment_status IN ('unpaid','pending','paid','refunded'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;

-- Migration for an existing EUROFY users table (safe to rerun).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

-- EUROFY pricing: supplier inputs are in GEL minor units, never guessed FX.
CREATE TABLE IF NOT EXISTS pricing_settings(id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),default_markup_percent numeric(7,2) NOT NULL DEFAULT 30 CHECK(default_markup_percent BETWEEN 0 AND 500),shipping_gel_minor integer NOT NULL DEFAULT 0 CHECK(shipping_gel_minor BETWEEN 0 AND 100000000));
INSERT INTO pricing_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS category_markups(category_id uuid PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,markup_percent numeric(7,2) NOT NULL CHECK(markup_percent BETWEEN 0 AND 500));
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_price_gel_minor integer CHECK(supplier_price_gel_minor>=0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_original_gel_minor integer CHECK(supplier_original_gel_minor>=0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS markup_override_percent numeric(7,2) CHECK(markup_override_percent BETWEEN 0 AND 500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS fixed_price_gel_minor integer CHECK(fixed_price_gel_minor>=0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_verified boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price_gel_minor integer CHECK(original_price_gel_minor>=0);

-- Residence and selected parcel pickup are separate fields.
ALTER TABLE users ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_city text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_location text;

-- Manual purchase and postal pickup workflow. No automatic payment or supplier purchase.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','confirmed','purchased','received_in_germany','in_transit','ready_for_pickup','delivered','cancelled'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_tracking_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_note text NOT NULL DEFAULT '';

-- Supplier data is private, never exposed by public product API.
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_product_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_stock_quantity integer CHECK (supplier_stock_quantity>=0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_availability text NOT NULL DEFAULT 'unknown' CHECK(supplier_availability IN ('unknown','in_stock','out_of_stock'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_last_synced_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_sync_source text;
