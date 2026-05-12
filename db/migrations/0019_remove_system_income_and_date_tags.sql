-- Stop using system income/expense and date hierarchy tags.
-- Remove existing links from transactions and clean up now-unreferenced system tags.

DELETE FROM transaction_tags
WHERE tag_id IN (
  SELECT id
  FROM tags
  WHERE source = 'system'
    AND (
      path = 'income'
      OR path = 'expense'
      OR path LIKE 'year-____'
      OR path LIKE 'year-____/month-__'
      OR path LIKE 'year-____/month-__/day-__'
    )
);

DELETE FROM tags
WHERE source = 'system'
  AND (
    path = 'income'
    OR path = 'expense'
    OR path LIKE 'year-____'
    OR path LIKE 'year-____/month-__'
    OR path LIKE 'year-____/month-__/day-__'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM transaction_tags tt
    WHERE tt.tag_id = tags.id
  );
