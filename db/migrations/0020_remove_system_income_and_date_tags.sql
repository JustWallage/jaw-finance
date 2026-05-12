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
      OR path GLOB 'year-[0-9][0-9][0-9][0-9]'
      OR path GLOB 'year-[0-9][0-9][0-9][0-9]/month-[0-9][0-9]'
      OR path GLOB 'year-[0-9][0-9][0-9][0-9]/month-[0-9][0-9]/day-[0-9][0-9]'
    )
);

DELETE FROM tags
WHERE source = 'system'
  AND (
    path = 'income'
    OR path = 'expense'
    OR path GLOB 'year-[0-9][0-9][0-9][0-9]'
    OR path GLOB 'year-[0-9][0-9][0-9][0-9]/month-[0-9][0-9]'
    OR path GLOB 'year-[0-9][0-9][0-9][0-9]/month-[0-9][0-9]/day-[0-9][0-9]'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM transaction_tags tt
    WHERE tt.tag_id = tags.id
  );
