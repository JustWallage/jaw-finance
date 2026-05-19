-- Add last_refreshed_at to track when transactions were last successfully synced
ALTER TABLE bank_connections ADD COLUMN last_refreshed_at TEXT DEFAULT NULL;
