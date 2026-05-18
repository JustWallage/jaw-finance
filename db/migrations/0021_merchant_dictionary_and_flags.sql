-- Global merchant patterns dictionary
CREATE TABLE IF NOT EXISTS global_merchant_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL UNIQUE,
  paths TEXT NOT NULL -- JSON array of tag path strings
);

-- Track whether transactions have been evaluated against the merchant dictionary
ALTER TABLE transactions ADD COLUMN merchant_db_evaluated INTEGER DEFAULT 0;
