import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env, request } = context;
  try {
    const userEmail = getUserEmail(request, env);
    const url = new URL(request.url);
    const accountUid = url.searchParams.get("account_uid");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

    let query: string;
    let binds: unknown[];

    if (accountUid) {
      query = `SELECT t.* FROM transactions t
        WHERE t.user_email = ? AND t.account_uid = ? AND t.booking_date >= ?
        AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id)
        ORDER BY t.booking_date DESC`;
      binds = [userEmail, accountUid, cutoff];
    } else {
      query = `SELECT t.* FROM transactions t
        WHERE t.user_email = ? AND t.booking_date >= ?
        AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id)
        ORDER BY t.booking_date DESC`;
      binds = [userEmail, cutoff];
    }

    const result = await env.DB.prepare(query)
      .bind(...binds)
      .all<DBTransaction>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    console.error("[ambiguous] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
