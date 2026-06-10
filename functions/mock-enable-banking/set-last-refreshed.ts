import { getUserEmail, type EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface SetLastRefreshedBody {
  connectionId: number;
  timestamp: number | null;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const userEmail = getUserEmail(context.request, env);
  const body = (await context.request.json()) as SetLastRefreshedBody;

  await env.DB.prepare(
    "UPDATE bank_connections SET last_refreshed_at = ? WHERE id = ? AND user_email = ?",
  )
    .bind(body.timestamp, body.connectionId, userEmail)
    .run();

  return Response.json({ message: "OK" });
};
