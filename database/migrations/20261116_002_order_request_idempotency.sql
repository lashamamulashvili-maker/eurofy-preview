-- Idempotency keys make customer order requests safe to retry after a lost response.
CREATE TABLE IF NOT EXISTS eurofy_order_request_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS eurofy_order_request_order_idx ON eurofy_order_request_keys(order_id);
