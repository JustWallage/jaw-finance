-- Add nullable `reasoning` column to tags. Acts as a dictionary definition
-- supplied to the LLM at evaluation time to improve tag-suggestion accuracy.
-- Existing rows default to NULL.
ALTER TABLE tags ADD COLUMN reasoning TEXT;
