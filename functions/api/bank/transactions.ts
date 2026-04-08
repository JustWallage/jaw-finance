import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request);
    const result = await env.DB.prepare(
      "SELECT * FROM transactions WHERE user_email = ? ORDER BY booking_date DESC, id DESC LIMIT 500",
    )
      .bind(userEmail)
      .all<DBTransaction>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
