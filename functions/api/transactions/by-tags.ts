import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

interface ByTagsRequest {
  paths: string[];
  account_uid?: string;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const body = (await context.request.json()) as ByTagsRequest;

    if (!body.paths || body.paths.length === 0) {
      return Response.json(
        { error: "paths array is required" },
        { status: 400 },
      );
    }

    // Build path matching conditions: each path matches exact or children
    const pathConditions: string[] = [];
    const pathBindings: string[] = [];
    for (const p of body.paths) {
      pathConditions.push("(t.path = ? OR t.path LIKE ?)");
      pathBindings.push(p, p + "/%");
    }

    const baseConditions = ["tx.user_email = ?"];
    const baseBindings: string[] = [userEmail];

    if (body.account_uid && body.account_uid !== "all") {
      baseConditions.push("tx.account_uid = ?");
      baseBindings.push(body.account_uid);
    }

    const where = `${baseConditions.join(" AND ")} AND (${pathConditions.join(" OR ")})`;
    const allBindings = [...baseBindings, ...pathBindings];

    // Fetch matching transactions
    const txQuery = `
      SELECT DISTINCT tx.* FROM transactions tx
      JOIN transaction_tags tt ON tx.id = tt.transaction_id
      JOIN tags t ON tt.tag_id = t.id
      WHERE ${where}
      ORDER BY tx.booking_date DESC, tx.id DESC
      LIMIT 500
    `;

    const txResult = await env.DB.prepare(txQuery)
      .bind(...allBindings)
      .all<DBTransaction>();

    // Aggregate totals
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

    const agg = await env.DB.prepare(aggQuery)
      .bind(...allBindings)
      .first<{ total_income: number; total_expense: number }>();

    return Response.json({
      transactions: txResult.results,
      totalIncome: agg?.total_income ?? 0,
      totalExpense: agg?.total_expense ?? 0,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
