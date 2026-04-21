import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import type { DBTransaction } from "../../../../db/types";

/**
 * GET /api/tags/:id/transactions — list all transactions linked to a tag
 * (or any of its descendants).
 */
export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const tagId = (context.params as { id: string }).id;

    const tag = await env.DB.prepare(
      "SELECT id, path FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(tagId, userEmail)
      .first<{ id: number; path: string }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    const result = await env.DB.prepare(
      `SELECT DISTINCT tx.* FROM transactions tx
       JOIN transaction_tags tt ON tt.transaction_id = tx.id
       JOIN tags t ON tt.tag_id = t.id
       WHERE tx.user_email = ?
         AND t.user_email = ?
         AND (t.path = ? OR t.path LIKE ?)
       ORDER BY tx.booking_date DESC`,
    )
      .bind(userEmail, userEmail, tag.path, tag.path + "/%")
      .all<DBTransaction>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
