import { getUserEmail, type EBEnv } from "../../lib/enable-banking";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM transactions WHERE user_email = ? AND ai_evaluated = 0",
    )
      .bind(userEmail)
      .first<{ count: number }>();
    return Response.json({ count: row?.count ?? 0 });
  } catch (err) {
    console.error("[pending-count] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
