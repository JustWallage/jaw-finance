import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import type { DBTag } from "../../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const txId = (context.params as { id: string }).id;

    const result = await env.DB.prepare(
      `SELECT t.* FROM tags t
       JOIN transaction_tags tt ON t.id = tt.tag_id
       WHERE tt.transaction_id = ? AND t.user_email = ?
       ORDER BY t.path ASC`,
    )
      .bind(txId, userEmail)
      .all<DBTag>();

    return Response.json({ tags: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};

export const onRequestPut: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const txId = (context.params as { id: string }).id;
    const body = (await context.request.json()) as { tag_id: number };

    if (!body.tag_id) {
      return Response.json({ error: "tag_id is required" }, { status: 400 });
    }

    // Verify tag belongs to user
    const tag = await env.DB.prepare(
      "SELECT id FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(body.tag_id, userEmail)
      .first<{ id: number }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    await env.DB.prepare(
      "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
    )
      .bind(txId, body.tag_id)
      .run();

    return Response.json({ assigned: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
