import { ebFetch, getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { EBTransactionsResponse } from "../../../db/types";
import { evaluateMerchantPatterns } from "../../lib/merchant-patterns";

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const connections = await env.DB.prepare(
      "SELECT account_uid FROM bank_connections WHERE user_email = ? AND valid_until > datetime('now')",
    )
      .bind(userEmail)
      .all<Pick<import("../../../db/types").DBBankConnection, "account_uid">>();

    if (!connections.results.length) {
      return Response.json(
        { error: "No active bank connections" },
        { status: 400 },
      );
    }

    const patterns = await env.DB.prepare(
      `SELECT pattern, paths FROM global_merchant_patterns`,
    ).all<{ pattern: string; paths: string }>();

    let totalSynced = 0;

    for (const conn of connections.results) {
      const latestRow = await env.DB.prepare(
        "SELECT MAX(booking_date) as latest FROM transactions WHERE account_uid = ? AND user_email = ?",
      )
        .bind(conn.account_uid, userEmail)
        .first<{ latest: string | null }>();

      const dateFrom =
        latestRow?.latest ??
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
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

        const data = (await res.json()) as EBTransactionsResponse;
        continuationKey = data.continuation_key ?? undefined;

        for (const tx of data.transactions) {
          const counterparty =
            tx.credit_debit_indicator === "CRDT"
              ? tx.debtor?.name
              : tx.creditor?.name;
          const remittanceInfo = tx.remittance_information?.join("; ") ?? null;

          const inserted = await env.DB.prepare(
            `INSERT INTO transactions (entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entry_reference, account_uid, user_email) DO NOTHING`,
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
              remittanceInfo,
              userEmail,
            )
            .run();

          // Auto-tag newly inserted transactions against merchant dictionary
          if (inserted.meta.changes > 0) {
            const row = await env.DB.prepare(
              `SELECT id FROM transactions WHERE entry_reference = ? AND account_uid = ? AND user_email = ?`,
            )
              .bind(tx.entry_reference ?? null, conn.account_uid, userEmail)
              .first<{ id: number }>();
            if (row) {
              await evaluateMerchantPatterns(
                env.DB,
                row.id,
                userEmail,
                remittanceInfo,
                counterparty ?? null,
                patterns.results,
              );
            }
          }

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
