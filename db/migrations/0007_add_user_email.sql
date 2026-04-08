-- Expand: Add user_email to bank_connections and transactions tables.
-- These columns are nullable to avoid breaking existing rows during migration.
-- The application layer enforces non-null for new inserts.

ALTER TABLE bank_connections ADD COLUMN user_email TEXT;

ALTER TABLE transactions ADD COLUMN user_email TEXT;
