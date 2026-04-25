import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTransaction } from "../../../db/types";

interface QueryObject {
  startDate?: string;
  endDate?: string;
  tagGlobs: string[];
}

interface ByTagsRequest {
  paths?: string[];
  queries?: QueryObject[];
  account_uid?: string;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const body = (await context.request.json()) as ByTagsRequest;

    // Backward compat: convert legacy `paths` to queries with glob patterns
    const queries = body.queries
      ?? (body.paths
        ? [{ tagGlobs: body.paths.flatMap((p) => [p, p + "/*"]) }]
        : null);
    if (!queries || queries.length === 0) {
      return Response.json(
        { error: "queries array is required" },
        { status: 400 },
      );
    }

    const baseConditions = ["tx.user_email = ?"];
    const baseBindings: string[] = [userEmail];

    if (body.account_uid && body.account_uid !== "all") {
      baseConditions.push("tx.account_uid = ?");
      baseBindings.push(body.account_uid);
    }

    // Each query object becomes an OR-ed group
    const queryGroups: string[] = [];
    const queryBindings: string[] = [];

    for (const q of queries) {
      if (!q.tagGlobs || q.tagGlobs.length === 0) continue;

      const groupParts: string[] = [];

      // Tag matching via GLOB
      const tagConds = q.tagGlobs.map(() => "t.path GLOB ?");
      groupParts.push(`(${tagConds.join(" OR ")})`);
      queryBindings.push(...q.tagGlobs);

      // Date filtering
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
      return Response.json(
        { error: "at least one query with tagGlobs is required" },
        { status: 400 },
      );
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

    const txResult = await env.DB.prepare(txQuery)
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
