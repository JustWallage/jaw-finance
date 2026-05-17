import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import type { Transaction } from "../hooks/useBankConnection";

interface Props {
  transactions: Transaction[];
  onSelect: (txId: number) => void;
  hideIncome?: boolean;
}

function groupByDate(transactions: Transaction[]) {
  const groups: Map<string, Transaction[]> = new Map();
  for (const tx of transactions) {
    const key = tx.booking_date ?? "Unknown";
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }
  return groups;
}

function formatDateHeader(dateStr: string) {
  if (dateStr === "Unknown") return "Unknown Date";
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short" });
}

function groupSubtotal(txs: Transaction[]) {
  let income = 0, expense = 0;
  for (const tx of txs) {
    const amt = Number(tx.amount);
    if (tx.credit_debit === "CRDT") income += amt;
    else expense += amt;
  }
  return { income, expense, net: income - expense };
}

export function TransactionFeed({ transactions, onSelect, hideIncome }: Props) {
  const groups = groupByDate(transactions);
  const entries = Array.from(groups.entries());

  return (
    <div className="space-y-4" data-testid="transactions-table">
      {entries.map(([date, txs], groupIndex) => {
        const sub = groupSubtotal(txs);
        return (
          <motion.div
            key={date}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.05, duration: 0.3 }}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDateHeader(date)}
              </h3>
              <span className={`text-xs font-medium ${sub.net >= 0 ? "text-income" : "text-expense"}`}>
                {sub.net >= 0 ? "+" : ""}{sub.net.toFixed(2)}
              </span>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {txs.map((tx) => (
                <button
                  key={tx.id}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
                  onClick={() => onSelect(tx.id)}
                  data-testid={`tx-row-${tx.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {tx.counterparty_name ?? "Unknown"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.remittance_info ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        tx.credit_debit === "CRDT" ? "text-income" : "text-expense"
                      } ${hideIncome && tx.credit_debit === "CRDT" ? "blur-md select-none" : ""}`}
                    >
                      {tx.credit_debit === "DBIT" ? "-" : "+"}{tx.amount} {tx.currency}
                    </span>
                    <Badge variant={tx.status === "BOOK" ? "default" : "secondary"} className="text-[10px] px-1 py-0">
                      {tx.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
