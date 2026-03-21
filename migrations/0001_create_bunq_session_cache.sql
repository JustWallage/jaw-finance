CREATE TABLE IF NOT EXISTS bunq_session_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bunq_session_cache_expires_at
  ON bunq_session_cache (expires_at);
