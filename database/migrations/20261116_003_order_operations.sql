-- Additive local order-operation records. No provider credentials or card data.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'disabled';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_payment_mode_check' AND conrelid='orders'::regclass) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_mode_check CHECK (payment_mode IN ('disabled','mock','provider'));
  END IF;
END $$;

ALTER TABLE eurofy_fulfillment_quotes ADD COLUMN IF NOT EXISTS evidence_reference text;
ALTER TABLE eurofy_fulfillment_quotes ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE IF NOT EXISTS eurofy_mock_payment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  amount_gel_minor bigint NOT NULL CHECK (amount_gel_minor >= 0),
  currency_code text NOT NULL DEFAULT 'GEL' CHECK (currency_code='GEL'),
  provider_reference text NOT NULL,
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id), UNIQUE (user_id,idempotency_key), UNIQUE (provider_reference)
);

CREATE TABLE IF NOT EXISTS eurofy_forwarding_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL UNIQUE REFERENCES eurofy_order_fulfillments(id),
  receiving_country text NOT NULL CHECK (receiving_country ~ '^[A-Z]{2}$'),
  expected_reference text,
  package_reference text UNIQUE,
  received_at timestamptz,
  received_by uuid REFERENCES users(id),
  condition_note text NOT NULL DEFAULT '',
  customs_document_status text NOT NULL DEFAULT 'not_started'
    CHECK (customs_document_status IN ('not_started','preparing','ready','submitted','cleared','exception')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurofy_mock_payment_order_idx ON eurofy_mock_payment_evidence(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS eurofy_forwarding_package_received_idx ON eurofy_forwarding_packages(received_at,created_at DESC);
