import type { EBEnv } from "../../lib/enable-banking";

interface ConnectionRow {
  id: number;
  session_id: string;
  account_uid: string;
  aspsp_name: string;
  aspsp_country: string;
  iban: string | null;
  valid_until: string;
  created_at: string;
  updated_at: string;
}

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM bank_connections ORDER BY created_at DESC",
    ).all<ConnectionRow>();

    return Response.json({ connections: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
