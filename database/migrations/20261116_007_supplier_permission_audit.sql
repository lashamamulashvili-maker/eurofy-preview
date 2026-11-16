ALTER TABLE eurofy_suppliers ADD COLUMN IF NOT EXISTS direct_shipping_evidence_ref text;
ALTER TABLE eurofy_suppliers ADD COLUMN IF NOT EXISTS eu_delivery_evidence_ref text;
ALTER TABLE eurofy_suppliers ADD COLUMN IF NOT EXISTS onward_export_evidence_ref text;

CREATE TABLE IF NOT EXISTS eurofy_supplier_permission_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_id uuid NOT NULL REFERENCES eurofy_suppliers(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('supplier_created','permissions_updated')),
 before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
 after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eurofy_supplier_permission_audit_idx
 ON eurofy_supplier_permission_audit(supplier_id,created_at DESC);
