import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env);
    const tagId = (context.params as { id: string }).id;

    const tag = await env.DB.prepare(
      "SELECT id, path FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(tagId, userEmail)
      .first<{ id: number; path: string }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    // Count transactions using this tag or any child tag
    const result = await env.DB.prepare(
      `SELECT COUNT(DISTINCT tt.transaction_id) as count
       FROM transaction_tags tt
       JOIN tags t ON tt.tag_id = t.id
       WHERE t.user_email = ? AND (t.path = ? OR t.path LIKE ?)`,
    )
      .bind(userEmail, tag.path, tag.path + "/%")
      .first<{ count: number }>();

    return Response.json({ count: result?.count ?? 0 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
