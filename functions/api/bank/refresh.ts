import { ebFetch, type EBEnv } from "../../lib/enable-banking";

interface EBTransaction {
  entry_reference?: string;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: string;
  status: string;
  booking_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
}

interface TransactionsResponse {
  transactions: EBTransaction[];
  continuation_key?: string;
}

interface ConnectionRow {
  account_uid: string;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const connections = await env.DB.prepare(
      "SELECT account_uid FROM bank_connections WHERE valid_until > datetime('now')",
    )
      .all<ConnectionRow>();

    if (!connections.results.length) {
      return Response.json({ error: "No active bank connections" }, { status: 400 });
    }

    let totalSynced = 0;

    for (const conn of connections.results) {
      const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      let continuationKey: string | undefined;
      do {
        let path = `/accounts/${conn.account_uid}/transactions?date_from=${dateFrom}`;
        if (continuationKey) {
          path += `&continuation_key=${encodeURIComponent(continuationKey)}`;
        }

        const res = await ebFetch(path, env);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Transactions fetch failed (${res.status}): ${text}`);
        }

        const data = (await res.json()) as TransactionsResponse;
        continuationKey = data.continuation_key ?? undefined;

        for (const tx of data.transactions) {
          const counterparty =
            tx.credit_debit_indicator === "CRDT"
              ? tx.debtor?.name
              : tx.creditor?.name;

          await env.DB.prepare(
            `INSERT INTO transactions (entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entry_reference, account_uid) DO NOTHING`,
          )
            .bind(
              tx.entry_reference ?? null,
              conn.account_uid,
              tx.transaction_amount.amount,
              tx.transaction_amount.currency,
              tx.credit_debit_indicator,
              tx.status,
              tx.booking_date ?? null,
              tx.transaction_date ?? null,
              counterparty ?? null,
              tx.remittance_information?.join("; ") ?? null,
            )
            .run();
          totalSynced++;
        }
      } while (continuationKey);
    }

    return Response.json({ synced: totalSynced });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
