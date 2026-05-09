-- Convert legacy boolean semantics (0/1) to epoch semantics.
-- 0 stays "pending", 1 becomes "evaluated at migration time".
UPDATE transactions
SET ai_evaluated = CAST(strftime('%s', 'now') AS INTEGER)
WHERE ai_evaluated = 1;
