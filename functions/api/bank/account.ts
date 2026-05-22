import { getUserEmail, type EBEnv } from "../../lib/enable-banking";

export const onRequestDelete: PagesFunction<EBEnv> = async (context) => {
  const { env, request } = context;
  try {
    const userEmail = getUserEmail(request, env.ENVIRONMENT);
    const body = (await request.json()) as { account_uid: string };

    if (!body.account_uid || typeof body.account_uid !== "string") {
      return Response.json(
        { error: "account_uid is required" },
        { status: 400 },
      );
    }

    // Delete transaction_tags for transactions belonging to this account
    await env.DB.prepare(
      `DELETE FROM transaction_tags WHERE transaction_id IN (
        SELECT id FROM transactions WHERE account_uid = ? AND user_email = ?
      )`,
    )
      .bind(body.account_uid, userEmail)
      .run();

    // Delete transactions for this account
    await env.DB.prepare(
      "DELETE FROM transactions WHERE account_uid = ? AND user_email = ?",
    )
      .bind(body.account_uid, userEmail)
      .run();

    // Delete the bank connection
    await env.DB.prepare(
      "DELETE FROM bank_connections WHERE account_uid = ? AND user_email = ?",
    )
      .bind(body.account_uid, userEmail)
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
