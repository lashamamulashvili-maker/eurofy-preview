CREATE TABLE IF NOT EXISTS eurofy_contact_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_name text NOT NULL CHECK(length(sender_name) BETWEEN 1 AND 120),
 sender_email text NOT NULL CHECK(length(sender_email) BETWEEN 3 AND 254),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 180),
 message text NOT NULL CHECK(length(message) BETWEEN 10 AND 5000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS eurofy_contact_messages_status_created_idx ON eurofy_contact_messages(status,created_at DESC);
