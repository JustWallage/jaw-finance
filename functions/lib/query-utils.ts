import type { DBTransaction } from "../../db/types";

export interface QueryObject {
  startDate?: string;
  endDate?: string;
  tagGlobs: string[];
}

export interface QueryResult {
  transactions: DBTransaction[];
  totalIncome: number;
  totalExpense: number;
}

/** Execute a tag-based query with GLOB matching, date filtering, and OR logic
 *  across multiple query objects. Returns matched transactions + aggregates. */
export async function executeTagQuery(
  db: D1Database,
  userEmail: string,
  queries: QueryObject[],
  accountUid?: string,
): Promise<QueryResult> {
  const baseConditions = ["tx.user_email = ?"];
  const baseBindings: string[] = [userEmail];

  if (accountUid && accountUid !== "all") {
    baseConditions.push("tx.account_uid = ?");
    baseBindings.push(accountUid);
  }

  const queryGroups: string[] = [];
  const queryBindings: string[] = [];

  for (const q of queries) {
    if (!q.tagGlobs || q.tagGlobs.length === 0) continue;

    const groupParts: string[] = [];

    const tagConds = q.tagGlobs.map(() => "t.path GLOB ?");
    groupParts.push(`(${tagConds.join(" OR ")})`);
    queryBindings.push(...q.tagGlobs);

    if (q.startDate) {
      groupParts.push("tx.booking_date >= ?");
      queryBindings.push(q.startDate);
    }
    if (q.endDate) {
      groupParts.push("tx.booking_date <= ?");
      queryBindings.push(q.endDate);
    }

    queryGroups.push(`(${groupParts.join(" AND ")})`);
  }

  if (queryGroups.length === 0) {
    return { transactions: [], totalIncome: 0, totalExpense: 0 };
  }

  const where = `${baseConditions.join(" AND ")} AND (${queryGroups.join(" OR ")})`;
  const allBindings = [...baseBindings, ...queryBindings];

  const txQuery = `
    SELECT DISTINCT tx.* FROM transactions tx
    JOIN transaction_tags tt ON tx.id = tt.transaction_id
    JOIN tags t ON tt.tag_id = t.id
    WHERE ${where}
    ORDER BY tx.booking_date DESC, tx.id DESC
    LIMIT 500
  `;

  const txResult = await db.prepare(txQuery)
    .bind(...allBindings)
    .all<DBTransaction>();

  const aggQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN tx.credit_debit = 'CRDT' THEN CAST(tx.amount AS REAL) ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN tx.credit_debit = 'DBIT' THEN CAST(tx.amount AS REAL) ELSE 0 END), 0) AS total_expense
    FROM (
      SELECT DISTINCT tx.id, tx.amount, tx.credit_debit FROM transactions tx
      JOIN transaction_tags tt ON tx.id = tt.transaction_id
      JOIN tags t ON tt.tag_id = t.id
      WHERE ${where}
    ) tx
  `;

  const agg = await db.prepare(aggQuery)
    .bind(...allBindings)
    .first<{ total_income: number; total_expense: number }>();

  return {
    transactions: txResult.results,
    totalIncome: agg?.total_income ?? 0,
    totalExpense: agg?.total_expense ?? 0,
  };
}
