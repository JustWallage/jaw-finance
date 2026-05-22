import { getUserEmail, type EBEnv } from "../lib/enable-banking";

export const onRequest: PagesFunction<EBEnv> = async (context) => {
  const url = new URL(context.request.url);

  // Don't block the consent endpoint itself, health checks, auth login, or the bank callback
  // (callback gets user identity from the OAuth state parameter, not headers)
  if (
    url.pathname === "/api" ||
    url.pathname === "/api/consent" ||
    url.pathname === "/api/health" ||
    url.pathname === "/api/auth/login" ||
    url.pathname === "/api/bank/callback"
  ) {
    return context.next();
  }

  try {
    const userEmail = getUserEmail(context.request, context.env.ENVIRONMENT);
    const row = await context.env.DB.prepare(
      "SELECT 1 FROM user_consents WHERE user_email = ?",
    )
      .bind(userEmail)
      .first();

    if (!row) {
      return Response.json({ error: "Consent required" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return context.next();
};
