import { getUserEmail, type EBEnv } from "../../../../lib/enable-banking";

export const onRequestDelete: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env);
    const params = context.params as { id: string; tagId: string };

    // Verify transaction belongs to user
    const tx = await env.DB.prepare(
      "SELECT id FROM transactions WHERE id = ? AND user_email = ?",
    )
      .bind(params.id, userEmail)
      .first();
    if (!tx) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Verify tag belongs to user
    const tag = await env.DB.prepare(
      "SELECT id FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(params.tagId, userEmail)
      .first<{ id: number }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    await env.DB.prepare(
      "DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?",
    )
      .bind(params.id, params.tagId)
      .run();

    return Response.json({ removed: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
