import type { EBEnv } from "./enable-banking";
import type { TagSource, TagStatus } from "../../db/types";

/**
 * Ensure a tag and all its ancestor tags exist in the tags table.
 * Returns the tag id for the given path.
 *
 * source/status are applied only on INSERT; existing rows keep their values.
 * If a leaf path is currently 'rejected', this throws — callers must handle.
 */
export async function ensureTagWithAncestors(
  db: EBEnv["DB"],
  userEmail: string,
  path: string,
  source: TagSource,
  status: TagStatus,
): Promise<number> {
  const segments = path.split("/");
  let tagId = 0;

  for (let i = 0; i < segments.length; i++) {
    const ancestorPath = segments.slice(0, i + 1).join("/");
    const name = segments[i];

    // INSERT-or-keep: name is the only mutable field on conflict, so source/status
    // on existing rows are preserved. Newly-inserted segments (incl. ancestors)
    // adopt the supplied source/status — callers pass 'unconfirmed' for LLM flows
    // so newly-generated ancestors also require user confirmation.
    const tag = await db
      .prepare(
        `INSERT INTO tags (user_email, name, path, source, status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
         RETURNING id, status`,
      )
      .bind(userEmail, name, ancestorPath, source, status)
      .first<{ id: number; status: TagStatus }>();

    if (tag) tagId = tag.id;
  }

  return tagId;
}

/**
 * Assign a tag to a transaction with leaf-node consolidation.
 * - Ensures all ancestor tags exist in the tags table (with given source/status on insert).
 * - Removes any ancestor tag links from transaction_tags for this transaction.
 * - Links the tag to the transaction.
 */
export async function assignTagConsolidated(
  db: EBEnv["DB"],
  transactionId: number,
  userEmail: string,
  tagPath: string,
  source: TagSource,
  status: TagStatus,
): Promise<number> {
  const tagId = await ensureTagWithAncestors(
    db,
    userEmail,
    tagPath,
    source,
    status,
  );

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

  await db
    .prepare(
      "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
    )
    .bind(transactionId, tagId)
    .run();

  return tagId;
}
