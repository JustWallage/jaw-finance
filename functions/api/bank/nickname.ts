import { getUserEmail, type EBEnv } from "../../lib/enable-banking";

export const onRequestPatch: PagesFunction<EBEnv> = async (context) => {
  const { env, request } = context;
  try {
    const userEmail = getUserEmail(request, env);
    const body = (await request.json()) as {
      nicknames: Record<string, string>;
    };

    if (!body.nicknames || typeof body.nicknames !== "object" || Array.isArray(body.nicknames)) {
      return Response.json(
        { error: "Expected nicknames to be a non-null object mapping account UIDs to nickname strings" },
        { status: 400 },
      );
    }

    const stmts = Object.entries(body.nicknames).map(([account_uid, nickname]) =>
      env.DB.prepare(
        "UPDATE bank_connections SET nickname = ? WHERE account_uid = ? AND user_email = ?",
      ).bind(nickname === "" ? null : nickname, account_uid, userEmail),
    );

    if (stmts.length > 0) await env.DB.batch(stmts);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
