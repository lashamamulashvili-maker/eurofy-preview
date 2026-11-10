-- EUROFY foundation (PostgreSQL). Not connected to the public preview yet.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 full_name text NOT NULL DEFAULT '',
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
