ALTER TABLE eurofy_supplier_products ADD COLUMN IF NOT EXISTS external_product_id text;
CREATE UNIQUE INDEX IF NOT EXISTS eurofy_supplier_external_product_uidx ON eurofy_supplier_products(supplier_id,external_product_id) WHERE external_product_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS eurofy_supplier_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_id uuid NOT NULL REFERENCES eurofy_suppliers(id),
 source_label text NOT NULL,
 status text NOT NULL DEFAULT 'previewed' CHECK(status IN ('previewed','reviewed','rejected')),
 records_total integer NOT NULL DEFAULT 0,
 records_valid integer NOT NULL DEFAULT 0,
 records_duplicate integer NOT NULL DEFAULT 0,
 created_by uuid NOT NULL REFERENCES users(id),
 reviewed_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS eurofy_supplier_import_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 import_id uuid NOT NULL REFERENCES eurofy_supplier_imports(id) ON DELETE CASCADE,
 supplier_id uuid NOT NULL REFERENCES eurofy_suppliers(id),
 external_product_id text NOT NULL,
 sku text NOT NULL,
 title text NOT NULL,
 price_minor bigint,
 currency_code text,
 stock_quantity integer,
 image_url text,
 external_category_id text,
 category_mapping_id uuid REFERENCES eurofy_supplier_category_mappings(id),
 fulfillment_claim text NOT NULL DEFAULT 'unverified' CHECK(fulfillment_claim IN ('unverified','direct','eu_forwarding','both')),
 resale_permission_verified boolean NOT NULL DEFAULT false,
 image_rights_verified boolean NOT NULL DEFAULT false,
 validation_status text NOT NULL CHECK(validation_status IN ('ready_for_review','unmapped_category','duplicate','invalid','permission_blocked')),
 simulated_action text NOT NULL CHECK(simulated_action IN ('would_create_draft','would_update','duplicate','blocked')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(import_id,external_product_id)
);
CREATE INDEX IF NOT EXISTS eurofy_import_items_queue_idx ON eurofy_supplier_import_items(validation_status,created_at DESC);
CREATE TABLE IF NOT EXISTS eurofy_supplier_import_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 import_id uuid NOT NULL REFERENCES eurofy_supplier_imports(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
