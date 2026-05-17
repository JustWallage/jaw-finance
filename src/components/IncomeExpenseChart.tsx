import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { MonthlyIncome } from "../hooks/useIncomeAnalytics";

interface Props {
  data: MonthlyIncome[];
  currentIncome: number;
  currentExpense: number;
  hideIncome?: boolean;
  compact?: boolean;
}

function formatMonth(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString("default", { month: "short" });
}

export function IncomeExpenseChart({ data, currentIncome, currentExpense, hideIncome, compact }: Props) {
  const chartData = data.map((d) => ({
    name: formatMonth(d.period),
    income: d.income,
    expense: d.expense,
  }));

  return (
    <div className="space-y-4" data-testid="income-expense-chart">
      <div className="flex items-baseline gap-6">
        <div>
          <p className="text-xs font-medium opacity-60">Income this month</p>
          <p
            className={`text-2xl font-bold text-income ${hideIncome ? "blur-md select-none" : ""}`}
            data-testid="current-month-income"
          >
            +{currentIncome.toFixed(2)} EUR
          </p>
        </div>
        <div>
          <p className="text-xs font-medium opacity-60">Expenses this month</p>
          <p className="text-2xl font-bold text-expense" data-testid="current-month-expense">
            -{currentExpense.toFixed(2)} EUR
          </p>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className={compact ? "h-40" : "h-56"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.55 0.15 155)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.55 0.15 155)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.58 0.14 20)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.58 0.14 20)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 70)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "oklch(0.50 0.02 60)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(0.50 0.02 60)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(1 0.005 80)",
                  border: "1px solid oklch(0.90 0.01 70)",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                }}
                formatter={(value, name) => [
                  `${Number(value).toFixed(2)} EUR`,
                  name === "income" ? "Income" : "Expenses",
                ]}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="oklch(0.55 0.15 155)"
                strokeWidth={2}
                fill="url(#incomeGrad)"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="oklch(0.58 0.14 20)"
                strokeWidth={2}
                fill="url(#expenseGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
