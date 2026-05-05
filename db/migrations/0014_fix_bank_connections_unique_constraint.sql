-- Fix bank_connections unique constraint for multi-tenant safety.
-- Old: UNIQUE(account_uid) — allows user B to overwrite user A's connection.
-- New: UNIQUE(account_uid, user_email) — each user owns their own connection.

CREATE TABLE IF NOT EXISTS bank_connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  account_uid TEXT NOT NULL,
  aspsp_name TEXT NOT NULL,
  aspsp_country TEXT NOT NULL,
  iban TEXT,
  valid_until DATETIME NOT NULL,
  user_email TEXT,
  oldest_synced_date TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_uid, user_email)
);

INSERT INTO bank_connections_new (id, session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until, user_email, oldest_synced_date, created_at, updated_at)
SELECT id, session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until, user_email, oldest_synced_date, created_at, updated_at
FROM bank_connections;

DROP TABLE bank_connections;

ALTER TABLE bank_connections_new RENAME TO bank_connections;
