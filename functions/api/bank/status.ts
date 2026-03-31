import type { EBEnv } from "../../lib/enable-banking";
import type { DBBankConnection } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM bank_connections ORDER BY created_at DESC",
    ).all<DBBankConnection>();

    return Response.json({ connections: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
