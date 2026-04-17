import type { EBEnv } from "./enable-banking";

/**
 * Ensure a tag and all its ancestor tags exist in the tags table.
 * Returns the tag id for the given path.
 */
export async function ensureTagWithAncestors(
  db: EBEnv["DB"],
  userEmail: string,
  path: string,
): Promise<number> {
  const segments = path.split("/");
  let tagId = 0;

  for (let i = 0; i < segments.length; i++) {
    const ancestorPath = segments.slice(0, i + 1).join("/");
    const name = segments[i];

    const tag = await db
      .prepare(
        `INSERT INTO tags (user_email, name, path)
         VALUES (?, ?, ?)
         ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
         RETURNING id`,
      )
      .bind(userEmail, name, ancestorPath)
      .first<{ id: number }>();

    if (tag) tagId = tag.id;
  }

  return tagId;
}

/**
 * Assign a tag to a transaction with leaf-node consolidation.
 * - Ensures all ancestor tags exist in the tags table.
 * - Removes any ancestor tag links from transaction_tags for this transaction.
 * - Links the tag to the transaction.
 */
export async function assignTagConsolidated(
  db: EBEnv["DB"],
  transactionId: number,
  userEmail: string,
  tagPath: string,
): Promise<number> {
  const tagId = await ensureTagWithAncestors(db, userEmail, tagPath);

  // Remove ancestor tags from this transaction's links.
  // Ancestors are prefixes of the current path.
  const segments = tagPath.split("/");
  for (let i = 1; i < segments.length; i++) {
    const ancestorPath = segments.slice(0, i).join("/");
    await db
      .prepare(
        `DELETE FROM transaction_tags
         WHERE transaction_id = ?
           AND tag_id IN (SELECT id FROM tags WHERE user_email = ? AND path = ?)`,
      )
      .bind(transactionId, userEmail, ancestorPath)
      .run();
  }

  // Link the tag
  await db
    .prepare(
      "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
    )
    .bind(transactionId, tagId)
    .run();

  return tagId;
}
