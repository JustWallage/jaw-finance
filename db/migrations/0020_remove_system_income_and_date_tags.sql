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
      OR (
        length(path) = 9
        AND path LIKE 'year-____'
        AND substr(path, 6, 1) BETWEEN '0' AND '9'
        AND substr(path, 7, 1) BETWEEN '0' AND '9'
        AND substr(path, 8, 1) BETWEEN '0' AND '9'
        AND substr(path, 9, 1) BETWEEN '0' AND '9'
      )
      OR (
        length(path) = 18
        AND path LIKE 'year-____/month-__'
        AND substr(path, 6, 1) BETWEEN '0' AND '9'
        AND substr(path, 7, 1) BETWEEN '0' AND '9'
        AND substr(path, 8, 1) BETWEEN '0' AND '9'
        AND substr(path, 9, 1) BETWEEN '0' AND '9'
        AND substr(path, 17, 1) BETWEEN '0' AND '9'
        AND substr(path, 18, 1) BETWEEN '0' AND '9'
      )
      OR (
        length(path) = 25
        AND path LIKE 'year-____/month-__/day-__'
        AND substr(path, 6, 1) BETWEEN '0' AND '9'
        AND substr(path, 7, 1) BETWEEN '0' AND '9'
        AND substr(path, 8, 1) BETWEEN '0' AND '9'
        AND substr(path, 9, 1) BETWEEN '0' AND '9'
        AND substr(path, 17, 1) BETWEEN '0' AND '9'
        AND substr(path, 18, 1) BETWEEN '0' AND '9'
        AND substr(path, 24, 1) BETWEEN '0' AND '9'
        AND substr(path, 25, 1) BETWEEN '0' AND '9'
      )
    )
);

DELETE FROM tags
WHERE source = 'system'
  AND (
    path = 'income'
    OR path = 'expense'
    OR (
      length(path) = 9
      AND path LIKE 'year-____'
      AND substr(path, 6, 1) BETWEEN '0' AND '9'
      AND substr(path, 7, 1) BETWEEN '0' AND '9'
      AND substr(path, 8, 1) BETWEEN '0' AND '9'
      AND substr(path, 9, 1) BETWEEN '0' AND '9'
    )
    OR (
      length(path) = 18
      AND path LIKE 'year-____/month-__'
      AND substr(path, 6, 1) BETWEEN '0' AND '9'
      AND substr(path, 7, 1) BETWEEN '0' AND '9'
      AND substr(path, 8, 1) BETWEEN '0' AND '9'
      AND substr(path, 9, 1) BETWEEN '0' AND '9'
      AND substr(path, 17, 1) BETWEEN '0' AND '9'
      AND substr(path, 18, 1) BETWEEN '0' AND '9'
    )
    OR (
      length(path) = 25
      AND path LIKE 'year-____/month-__/day-__'
      AND substr(path, 6, 1) BETWEEN '0' AND '9'
      AND substr(path, 7, 1) BETWEEN '0' AND '9'
      AND substr(path, 8, 1) BETWEEN '0' AND '9'
      AND substr(path, 9, 1) BETWEEN '0' AND '9'
      AND substr(path, 17, 1) BETWEEN '0' AND '9'
      AND substr(path, 18, 1) BETWEEN '0' AND '9'
      AND substr(path, 24, 1) BETWEEN '0' AND '9'
      AND substr(path, 25, 1) BETWEEN '0' AND '9'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM transaction_tags tt
    WHERE tt.tag_id = tags.id
  );
