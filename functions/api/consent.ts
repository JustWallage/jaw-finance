import { getUserEmail, type EBEnv } from "../lib/enable-banking";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const userEmail = getUserEmail(context.request, context.env);
  const row = await context.env.DB.prepare(
    "SELECT 1 FROM user_consents WHERE user_email = ?",
  )
    .bind(userEmail)
    .first();
  return Response.json({ consented: !!row });
};

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const userEmail = getUserEmail(context.request, context.env);
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO user_consents (user_email) VALUES (?)",
  )
    .bind(userEmail)
    .run();
  return Response.json({ consented: true });
};
