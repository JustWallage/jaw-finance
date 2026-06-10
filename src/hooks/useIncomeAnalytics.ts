import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export interface MonthlyIncome {
  period: string;
  income: number;
  expense: number;
}

interface AnalyticsResponse {
  total_income: number;
  total_expense: number;
  net_flow: number;
  by_month?: MonthlyIncome[];
}

export function useIncomeAnalytics(accountUid: string) {
  const [currentMonthIncome, setCurrentMonthIncome] = useState<number | null>(
    null,
  );
  const [currentMonthExpense, setCurrentMonthExpense] = useState<number | null>(
    null,
  );
  const [pastMonths, setPastMonths] = useState<MonthlyIncome[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accountUid) return;

    const now = new Date();
    const startDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    )
      .toISOString()
      .split("T")[0];
    const endDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .split("T")[0];

    const params = new URLSearchParams({
      account_uid: accountUid,
      start_date: startDate,
      end_date: endDate,
      group_by: "month",
    });

    apiFetch<AnalyticsResponse>(`/api/transactions/analytics?${params}`)
      .then((data) => {
        if (!data.by_month) return;
        const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const current = data.by_month.find((m) => m.period === currentPeriod);
        setCurrentMonthIncome(current?.income ?? 0);
        setCurrentMonthExpense(current?.expense ?? 0);
        setPastMonths(
          data.by_month.filter((m) => m.period !== currentPeriod).reverse(),
        );
      })
      .catch(() => {
        /* ignore */
      });
  }, [accountUid, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { currentMonthIncome, currentMonthExpense, pastMonths, refresh };
}
