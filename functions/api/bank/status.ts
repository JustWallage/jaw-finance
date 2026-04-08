import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBBankConnection } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request);
    const result = await env.DB.prepare(
      "SELECT * FROM bank_connections WHERE user_email = ? ORDER BY created_at DESC",
    )
      .bind(userEmail)
      .all<DBBankConnection>();

    return Response.json({
      connections: result.results,
      user_email: userEmail,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
