import type { EBEnv } from "../../lib/enable-banking";

interface TransactionRow {
  id: number;
  entry_reference: string | null;
  account_uid: string;
  amount: string;
  currency: string;
  credit_debit: string;
  status: string;
  booking_date: string | null;
  transaction_date: string | null;
  counterparty_name: string | null;
  remittance_info: string | null;
  created_at: string;
}

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM transactions ORDER BY booking_date DESC, id DESC LIMIT 500",
    ).all<TransactionRow>();

    return Response.json({ transactions: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
