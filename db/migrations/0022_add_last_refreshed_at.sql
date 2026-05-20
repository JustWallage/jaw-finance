-- Add last_refreshed_at (epoch ms) to track when transactions were last successfully synced
ALTER TABLE bank_connections ADD COLUMN last_refreshed_at INTEGER DEFAULT NULL;
