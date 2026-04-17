import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import { assignTagConsolidated } from "../../../lib/tag-utils";
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
    const txId = Number((context.params as { id: string }).id);
    const body = (await context.request.json()) as { tag_id: number };

    if (!body.tag_id) {
      return Response.json({ error: "tag_id is required" }, { status: 400 });
    }

    // Look up the tag to get its path
    const tag = await env.DB.prepare(
      "SELECT id, path FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(body.tag_id, userEmail)
      .first<{ id: number; path: string }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    // Assign with leaf-node consolidation (removes ancestor links)
    await assignTagConsolidated(env.DB, txId, userEmail, tag.path);

    return Response.json({ assigned: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
