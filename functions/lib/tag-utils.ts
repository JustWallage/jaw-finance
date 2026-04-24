import type { EBEnv } from "./enable-banking";
import type { TagSource, TagStatus } from "../../db/types";

/**
 * Ensure a tag and all its ancestor tags exist in the tags table.
 * Returns the tag id for the given path.
 *
 * source/status/reasoning are applied only on INSERT; existing rows keep their
 * values. `leafReasoning` is written only to the leaf segment; ancestors are
 * inserted with reasoning = NULL.
 */
export async function ensureTagWithAncestors(
  db: EBEnv["DB"],
  userEmail: string,
  path: string,
  source: TagSource,
  status: TagStatus,
  leafReasoning: string | null,
): Promise<number> {
  const segments = path.split("/");
  let tagId = 0;

  for (let i = 0; i < segments.length; i++) {
    const ancestorPath = segments.slice(0, i + 1).join("/");
    const name = segments[i];
    const isLeaf = i === segments.length - 1;
    const reasoning = isLeaf ? leafReasoning : null;

    // INSERT-or-keep: only `name` is mutated on conflict, so source/status/reasoning
    // for existing rows are preserved.
    const tag = await db
      .prepare(
        `INSERT INTO tags (user_email, name, path, source, status, reasoning)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
         RETURNING id, status`,
      )
      .bind(userEmail, name, ancestorPath, source, status, reasoning)
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
 *
 * `leafReasoning` is propagated to the leaf segment on insert only; pass null
 * for non-LLM flows (manual user tagging, system auto-tags).
 */
export async function assignTagConsolidated(
  db: EBEnv["DB"],
  transactionId: number,
  userEmail: string,
  tagPath: string,
  source: TagSource,
  status: TagStatus,
  leafReasoning: string | null,
): Promise<number> {
  const tagId = await ensureTagWithAncestors(
    db,
    userEmail,
    tagPath,
    source,
    status,
    leafReasoning,
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
