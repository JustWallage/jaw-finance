import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";

export const onRequestDelete: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const tagId = (context.params as { id: string }).id;

    const tag = await env.DB.prepare(
      "SELECT id FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(tagId, userEmail)
      .first<{ id: number }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    // Delete tag (CASCADE removes transaction_tags rows)
    await env.DB.prepare("DELETE FROM tags WHERE id = ? AND user_email = ?")
      .bind(tagId, userEmail)
      .run();

    return Response.json({ deleted: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
