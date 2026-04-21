-- Add status (confirmed/unconfirmed/rejected) and source (system/user/llm) to tags.
-- New rows default to confirmed/user; backfill existing rows accordingly.

ALTER TABLE tags ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE tags ADD COLUMN source TEXT NOT NULL DEFAULT 'user';

-- Backfill: tags created by autoTagTransaction are deterministic.
-- LIKE wildcards are used (GLOB character classes can exceed SQLite's pattern complexity limit).
UPDATE tags SET source = 'system'
WHERE path = 'income'
   OR path = 'expense'
   OR path LIKE 'year-____'
   OR path LIKE 'year-____/month-__'
   OR path LIKE 'year-____/month-__/day-__';

CREATE INDEX IF NOT EXISTS idx_tags_user_status ON tags(user_email, status);
