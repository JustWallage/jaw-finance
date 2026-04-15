import type { EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM transaction_tags"),
    env.DB.prepare("DELETE FROM tags"),
    env.DB.prepare("DELETE FROM mock_enable_banking_auth_codes"),
    env.DB.prepare("DELETE FROM mock_enable_banking_sessions"),
    env.DB.prepare("DELETE FROM transactions"),
    env.DB.prepare("DELETE FROM bank_connections"),
  ]);

  return Response.json({ message: "OK" });
};
