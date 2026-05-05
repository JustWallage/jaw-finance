import { getUserEmail, type EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const userEmail = getUserEmail(context.request, env.ENVIRONMENT);

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM transaction_tags WHERE transaction_id IN (SELECT id FROM transactions WHERE user_email = ?)",
    ).bind(userEmail),
    env.DB.prepare("DELETE FROM tags WHERE user_email = ?").bind(userEmail),
    env.DB.prepare(
      "DELETE FROM mock_enable_banking_auth_codes WHERE user_email = ?",
    ).bind(userEmail),
    env.DB.prepare(
      "DELETE FROM mock_enable_banking_sessions WHERE user_email = ?",
    ).bind(userEmail),
    env.DB.prepare("DELETE FROM transactions WHERE user_email = ?").bind(
      userEmail,
    ),
    env.DB.prepare("DELETE FROM bank_connections WHERE user_email = ?").bind(
      userEmail,
    ),
  ]);

  return Response.json({ message: "OK" });
};
