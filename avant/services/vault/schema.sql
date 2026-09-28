-- Ciphertext only. The vault cannot decrypt anything it stores: the app
-- seals each record with AES-256-GCM before sending it.
CREATE TABLE IF NOT EXISTS records (
  key         TEXT PRIMARY KEY,          -- HMAC of the session id, 48 hex chars
  sealed      TEXT NOT NULL,             -- v1.<kid>.<iv>.<ciphertext>
  updated_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS records_expires ON records (expires_at);

-- Who touched what, without personal data: a prefix of the key, the action,
-- the outcome, and when.
CREATE TABLE IF NOT EXISTS audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  action      TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  status      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at);
