-- Additive EUROFY hybrid-fulfillment foundation.
-- Prerequisite: database/schema.sql has been applied to this EUROFY database.
-- No existing rows are deleted or rewritten. Existing products default to demo.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'demo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_publication_status_check'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_publication_status_check
      CHECK (publication_status IN ('demo','draft','published','blocked'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS eurofy_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'manual'
    CHECK (provider_type IN ('manual','syncee','mock')),
  enabled boolean NOT NULL DEFAULT false,
  resale_authorized boolean NOT NULL DEFAULT false,
  resale_evidence_ref text,
  terms_verified_at timestamptz,
  direct_ship_countries text[] NOT NULL DEFAULT '{}',
  eu_delivery_countries text[] NOT NULL DEFAULT '{}',
  onward_export_countries text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(supplier_code)) > 0),
  CHECK (length(trim(display_name)) > 0),
  CHECK (NOT resale_authorized OR (resale_evidence_ref IS NOT NULL AND terms_verified_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS eurofy_supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES eurofy_suppliers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  supplier_sku text NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  supplier_price_minor bigint CHECK (supplier_price_minor >= 0),
  minimum_order_quantity integer NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  authorized_for_resale boolean NOT NULL DEFAULT false,
  authorization_evidence_ref text,
  supplier_product_url text,
  direct_shipping_enabled boolean NOT NULL DEFAULT false,
  direct_ship_countries text[] NOT NULL DEFAULT '{}',
  eu_delivery_enabled boolean NOT NULL DEFAULT false,
  eu_delivery_countries text[] NOT NULL DEFAULT '{}',
  onward_export_countries text[] NOT NULL DEFAULT '{}',
  terms_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, supplier_sku),
  CHECK (length(trim(supplier_sku)) > 0),
  CHECK (NOT authorized_for_resale OR (authorization_evidence_ref IS NOT NULL AND terms_verified_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS eurofy_supplier_products_product_idx
  ON eurofy_supplier_products(product_id);

CREATE TABLE IF NOT EXISTS eurofy_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid NOT NULL REFERENCES eurofy_supplier_products(id),
  availability text NOT NULL CHECK (availability IN ('unknown','in_stock','out_of_stock')),
  quantity integer CHECK (quantity >= 0),
  source text NOT NULL CHECK (source IN ('manual','mock','syncee')),
  source_reference text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  stale_after timestamptz,
  CHECK (stale_after IS NULL OR stale_after > checked_at)
);

CREATE INDEX IF NOT EXISTS eurofy_inventory_latest_idx
  ON eurofy_inventory_snapshots(supplier_product_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS eurofy_supplier_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid NOT NULL REFERENCES eurofy_supplier_products(id),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  source text NOT NULL CHECK (source IN ('manual','mock','syncee')),
  source_reference text,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurofy_supplier_price_latest_idx
  ON eurofy_supplier_price_history(supplier_product_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS eurofy_product_image_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  image_url text NOT NULL,
  license_status text NOT NULL DEFAULT 'pending'
    CHECK (license_status IN ('pending','verified','not_authorized')),
  evidence_reference text,
  allowed_countries text[] NOT NULL DEFAULT '{}',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (license_status <> 'verified' OR (evidence_reference IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS eurofy_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  label text NOT NULL DEFAULT 'Home',
  recipient_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  postal_code text NOT NULL DEFAULT '',
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurofy_customer_addresses_user_idx
  ON eurofy_customer_addresses(user_id, is_default DESC, created_at);

CREATE TABLE IF NOT EXISTS eurofy_shopping_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eurofy_shopping_cart_items (
  cart_id uuid NOT NULL REFERENCES eurofy_shopping_carts(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS eurofy_fulfillment_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid NOT NULL REFERENCES eurofy_supplier_products(id),
  fulfillment_model text NOT NULL CHECK (fulfillment_model IN ('direct_dropship','eu_forwarding')),
  destination_country text NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  eu_receiving_country text CHECK (eu_receiving_country IS NULL OR eu_receiving_country ~ '^[A-Z]{2}$'),
  cost_breakdown jsonb NOT NULL,
  total_cost_gel_minor bigint CHECK (total_cost_gel_minor >= 0),
  retail_price_gel_minor bigint CHECK (retail_price_gel_minor >= 0),
  estimated_profit_gel_minor bigint,
  costs_verified boolean NOT NULL DEFAULT false,
  min_delivery_days integer CHECK (min_delivery_days IS NULL OR min_delivery_days >= 0),
  max_delivery_days integer CHECK (max_delivery_days IS NULL OR max_delivery_days >= min_delivery_days),
  recommended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eurofy_order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  supplier_product_id uuid NOT NULL REFERENCES eurofy_supplier_products(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  fulfillment_model text NOT NULL CHECK (fulfillment_model IN ('direct_dropship','eu_forwarding')),
  status text NOT NULL DEFAULT 'order_created' CHECK (status IN (
    'order_created','payment_pending','payment_verified','supplier_review','supplier_order_draft',
    'supplier_order_submitted','supplier_shipped','eu_receipt_pending','eu_received','forwarding',
    'customs','delivered','cancellation_requested','cancelled','refund_pending','refunded','failed'
  )),
  destination_country text NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  eu_receiving_country text CHECK (eu_receiving_country IS NULL OR eu_receiving_country ~ '^[A-Z]{2}$'),
  idempotency_key text NOT NULL UNIQUE,
  route_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS eurofy_order_fulfillments_order_idx
  ON eurofy_order_fulfillments(order_id, created_at);

CREATE TABLE IF NOT EXISTS eurofy_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid NOT NULL REFERENCES eurofy_supplier_products(id),
  fulfillment_id uuid NOT NULL UNIQUE REFERENCES eurofy_order_fulfillments(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','fulfilled','released')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurofy_inventory_reservations_active_idx
  ON eurofy_inventory_reservations(supplier_product_id) WHERE status='reserved';

CREATE TABLE IF NOT EXISTS eurofy_fulfillment_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES eurofy_order_fulfillments(id),
  leg_type text NOT NULL CHECK (leg_type IN ('supplier_to_customer','supplier_to_eu','eu_to_georgia')),
  carrier text,
  tracking_number text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','label_created','in_transit','delayed','customs','delivered','exception','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fulfillment_id, leg_type)
);

CREATE TABLE IF NOT EXISTS eurofy_shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES eurofy_fulfillment_shipments(id),
  event_key text NOT NULL,
  status text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text,
  occurred_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('manual','mock','carrier')),
  UNIQUE (shipment_id, event_key)
);

CREATE TABLE IF NOT EXISTS eurofy_fulfillment_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid REFERENCES eurofy_order_fulfillments(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  before_state jsonb,
  after_state jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurofy_fulfillment_audit_created_idx
  ON eurofy_fulfillment_audit_events(created_at DESC);
