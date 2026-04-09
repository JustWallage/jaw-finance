import { getUserEmail, type EBEnv } from "../../lib/enable-banking";

interface MonthRow {
  period: string;
  income: number;
  expense: number;
}

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const url = new URL(context.request.url);

    const accountUid = url.searchParams.get("account_uid");
    if (!accountUid) {
      return Response.json(
        { error: "account_uid is required" },
        { status: 400 },
      );
    }

    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const type = url.searchParams.get("type"); // "income" | "expense" | null
    const groupBy = url.searchParams.get("group_by"); // "month" | "tag" | "type" | null

    // Build dynamic WHERE clause
    const conditions = ["user_email = ?"];
    const bindings: string[] = [userEmail];

    if (accountUid !== "all") {
      conditions.push("account_uid = ?");
      bindings.push(accountUid);
    }

    if (startDate) {
      conditions.push("booking_date >= ?");
      bindings.push(startDate);
    }

    if (endDate) {
      conditions.push("booking_date <= ?");
      bindings.push(endDate);
    }

    if (type === "income") {
      conditions.push("credit_debit = 'CRDT'");
    } else if (type === "expense") {
      conditions.push("credit_debit = 'DBIT'");
    }

    const where = conditions.join(" AND ");

    // Totals query
    const totalsQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN credit_debit = 'CRDT' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN credit_debit = 'DBIT' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS total_expense
      FROM transactions
      WHERE ${where}
    `;

    const totals = await env.DB.prepare(totalsQuery)
      .bind(...bindings)
      .first<{ total_income: number; total_expense: number }>();

    const totalIncome = totals?.total_income ?? 0;
    const totalExpense = totals?.total_expense ?? 0;

    const result: Record<string, unknown> = {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_flow: Math.round((totalIncome - totalExpense) * 100) / 100,
    };

    // Group by month
    if (groupBy === "month") {
      const monthQuery = `
        SELECT
          strftime('%Y-%m', booking_date) AS period,
          COALESCE(SUM(CASE WHEN credit_debit = 'CRDT' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN credit_debit = 'DBIT' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS expense
        FROM transactions
        WHERE ${where} AND booking_date IS NOT NULL
        GROUP BY period
        ORDER BY period ASC
      `;

      const months = await env.DB.prepare(monthQuery)
        .bind(...bindings)
        .all<MonthRow>();

      result.by_month = months.results;
    }

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
