-- Allow multiple accounts per session in mock table
DROP TABLE IF EXISTS mock_enable_banking_sessions;

CREATE TABLE mock_enable_banking_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  account_uid TEXT NOT NULL,
  aspsp_name TEXT NOT NULL,
  aspsp_country TEXT NOT NULL,
  iban TEXT,
  valid_until TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, account_uid)
);
