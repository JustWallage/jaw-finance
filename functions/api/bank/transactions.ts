import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env);
    const url = new URL(context.request.url);
    const since = url.searchParams.get("since");
    const accountUid = url.searchParams.get("account_uid");

    const conditions = ["user_email = ?"];
    const bindings: string[] = [userEmail];

    if (since) {
      conditions.push("booking_date >= ?");
      bindings.push(since);
    }

    if (accountUid) {
      conditions.push("account_uid = ?");
      bindings.push(accountUid);
    }

    const where = conditions.join(" AND ");
    const query = `SELECT * FROM transactions WHERE ${where} ORDER BY booking_date DESC, id DESC LIMIT 500`;

    const result = await env.DB.prepare(query)
      .bind(...bindings)
      .all<DBTransaction>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
