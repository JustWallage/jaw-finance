import { ebFetch, getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type {
  EBTransactionsResponse,
  EBTransaction,
} from "../../../db/types";

interface ImportRequest {
  account_uid: string;
  date_from: string;
  date_to: string;
}

/** Batch-insert transactions using D1 batch to minimise roundtrips. */
async function batchInsertTransactions(
  db: D1Database,
  txns: EBTransaction[],
  accountUid: string,
  userEmail: string,
): Promise<number> {
  if (txns.length === 0) return 0;

  const statements: D1PreparedStatement[] = [];

  for (const tx of txns) {
    const counterparty =
      tx.credit_debit_indicator === "CRDT"
        ? tx.debtor?.name
        : tx.creditor?.name;

    statements.push(
      db
        .prepare(
          `INSERT INTO transactions (entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info, user_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(entry_reference, account_uid, user_email)
           DO UPDATE SET entry_reference = excluded.entry_reference`,
        )
        .bind(
          tx.entry_reference ?? null,
          accountUid,
          tx.transaction_amount.amount,
          tx.transaction_amount.currency,
          tx.credit_debit_indicator,
          tx.status,
          tx.booking_date ?? null,
          tx.transaction_date ?? null,
          counterparty ?? null,
          tx.remittance_information?.join("; ") ?? null,
          userEmail,
        ),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return txns.length;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const body = (await context.request.json()) as ImportRequest;

    if (!body.account_uid || !body.date_from || !body.date_to) {
      return Response.json(
        { error: "account_uid, date_from, and date_to are required" },
        { status: 400 },
      );
    }

    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const connection = await env.DB.prepare(
      "SELECT account_uid FROM bank_connections WHERE account_uid = ? AND user_email = ? AND valid_until > datetime('now')",
    )
      .bind(body.account_uid, userEmail)
      .first<{ account_uid: string }>();

    if (!connection) {
      return Response.json(
        { error: "No active connection for this account" },
        { status: 400 },
      );
    }

    let totalSynced = 0;
    let continuationKey: string | undefined;

    do {
      let path = `/accounts/${body.account_uid}/transactions?date_from=${body.date_from}&date_to=${body.date_to}`;
      if (continuationKey) {
        path += `&continuation_key=${encodeURIComponent(continuationKey)}`;
      }

      const res = await ebFetch(path, env);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Transactions fetch failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as EBTransactionsResponse;
      continuationKey = data.continuation_key ?? undefined;

      totalSynced += await batchInsertTransactions(
        env.DB,
        data.transactions,
        body.account_uid,
        userEmail,
      );
    } while (continuationKey);

    await env.DB.prepare(
      `UPDATE bank_connections
       SET oldest_synced_date = ?
       WHERE account_uid = ? AND user_email = ?
         AND (oldest_synced_date IS NULL OR oldest_synced_date > ?)`,
    )
      .bind(body.date_from, body.account_uid, userEmail, body.date_from)
      .run();

    const updated = await env.DB.prepare(
      "SELECT oldest_synced_date FROM bank_connections WHERE account_uid = ? AND user_email = ?",
    )
      .bind(body.account_uid, userEmail)
      .first<{ oldest_synced_date: string | null }>();

    return Response.json({
      synced: totalSynced,
      oldest_synced_date: updated?.oldest_synced_date ?? body.date_from,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
