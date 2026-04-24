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

function buildDateTagPaths(bookingDate: string): {
  year: string;
  month: string;
  day: string;
} {
  const d = new Date(bookingDate + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const year = `year-${y}`;
  return { year, month: `${year}/month-${m}`, day: `${year}/month-${m}/day-${dd}` };
}

/** Batch-insert transactions and auto-tags using D1 batch to minimise roundtrips. */
async function batchInsertAndTag(
  db: D1Database,
  txns: EBTransaction[],
  accountUid: string,
  userEmail: string,
): Promise<number> {
  if (txns.length === 0) return 0;

  // --- Phase 1: INSERT transactions + INSERT unique tags (single roundtrip) ---
  const phase1: D1PreparedStatement[] = [];
  const txCount = txns.length;

  for (const tx of txns) {
    const counterparty =
      tx.credit_debit_indicator === "CRDT"
        ? tx.debtor?.name
        : tx.creditor?.name;

    phase1.push(
      db
        .prepare(
          `INSERT INTO transactions (entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info, user_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(entry_reference, account_uid, user_email)
           DO UPDATE SET entry_reference = excluded.entry_reference
           RETURNING id`,
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

  // Collect unique tag paths across all transactions in this page
  const uniqueTagPaths: string[] = [];
  const tagPathSet = new Set<string>();
  const addPath = (p: string) => {
    if (!tagPathSet.has(p)) {
      tagPathSet.add(p);
      uniqueTagPaths.push(p);
    }
  };

  for (const tx of txns) {
    addPath(tx.credit_debit_indicator === "CRDT" ? "income" : "expense");
    if (tx.booking_date) {
      const { year, month, day } = buildDateTagPaths(tx.booking_date);
      addPath(year);
      addPath(month);
      addPath(day);
    }
  }

  for (const tagPath of uniqueTagPaths) {
    const name = tagPath.split("/").pop()!;
    phase1.push(
      db
        .prepare(
          `INSERT INTO tags (user_email, name, path, source, status, reasoning)
           VALUES (?, ?, ?, 'system', 'confirmed', NULL)
           ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
           RETURNING id`,
        )
        .bind(userEmail, name, tagPath),
    );
  }

  const phase1Results = await db.batch(phase1);

  // Extract IDs
  const txIds: (number | null)[] = [];
  for (let i = 0; i < txCount; i++) {
    const rows = phase1Results[i].results as { id: number }[] | undefined;
    txIds.push(rows?.[0]?.id ?? null);
  }

  const tagPathToId = new Map<string, number>();
  for (let i = 0; i < uniqueTagPaths.length; i++) {
    const rows = phase1Results[txCount + i].results as
      | { id: number }[]
      | undefined;
    const id = rows?.[0]?.id;
    if (id) tagPathToId.set(uniqueTagPaths[i], id);
  }

  // --- Phase 2: link transaction_tags with ancestor consolidation (single roundtrip) ---
  const phase2: D1PreparedStatement[] = [];

  for (let i = 0; i < txns.length; i++) {
    const txId = txIds[i];
    const tx = txns[i];
    if (!txId || !tx.entry_reference) continue;

    // income / expense link
    const typePath =
      tx.credit_debit_indicator === "CRDT" ? "income" : "expense";
    const typeTagId = tagPathToId.get(typePath);
    if (typeTagId) {
      phase2.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
          )
          .bind(txId, typeTagId),
      );
    }

    // date tag with ancestor consolidation
    if (tx.booking_date) {
      const { year, month, day } = buildDateTagPaths(tx.booking_date);
      const yearTagId = tagPathToId.get(year);
      const monthTagId = tagPathToId.get(month);
      const dayTagId = tagPathToId.get(day);

      if (yearTagId) {
        phase2.push(
          db
            .prepare(
              "DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?",
            )
            .bind(txId, yearTagId),
        );
      }
      if (monthTagId) {
        phase2.push(
          db
            .prepare(
              "DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?",
            )
            .bind(txId, monthTagId),
        );
      }
      if (dayTagId) {
        phase2.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
            )
            .bind(txId, dayTagId),
        );
      }
    }
  }

  if (phase2.length > 0) {
    await db.batch(phase2);
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

      totalSynced += await batchInsertAndTag(
        env.DB,
        data.transactions,
        body.account_uid,
        userEmail,
      );
    } while (continuationKey);

    await env.DB.prepare(
      `UPDATE bank_connections
       SET oldest_synced_date = ?
       WHERE account_uid = ?
         AND (oldest_synced_date IS NULL OR oldest_synced_date > ?)`,
    )
      .bind(body.date_from, body.account_uid, body.date_from)
      .run();

    const updated = await env.DB.prepare(
      "SELECT oldest_synced_date FROM bank_connections WHERE account_uid = ?",
    )
      .bind(body.account_uid)
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
