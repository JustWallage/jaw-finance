import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request);
    const url = new URL(context.request.url);
    const since = url.searchParams.get("since");

    const query = since
      ? "SELECT * FROM transactions WHERE user_email = ? AND booking_date >= ? ORDER BY booking_date DESC, id DESC LIMIT 500"
      : "SELECT * FROM transactions WHERE user_email = ? ORDER BY booking_date DESC, id DESC LIMIT 500";

    const stmt = since
      ? env.DB.prepare(query).bind(userEmail, since)
      : env.DB.prepare(query).bind(userEmail);

    const result = await stmt.all<DBTransaction>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
