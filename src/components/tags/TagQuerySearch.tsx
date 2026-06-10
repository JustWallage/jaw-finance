import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { DBTransaction } from "../../../db/types";
import { apiFetch } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QueryResult {
  transactions: DBTransaction[];
  totalIncome: number;
  totalExpense: number;
  byPath: {
    path: string;
    totalIncome: number;
    totalExpense: number;
    count: number;
  }[];
}

export function TagQuerySearch() {
  const [glob, setGlob] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!glob.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const raw = await apiFetch<
        Omit<QueryResult, "byPath"> & { byPath?: QueryResult["byPath"] }
      >("/api/transactions/by-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: [
            {
              tagGlobs: [glob.trim()],
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
            },
          ],
        }),
      });
      setResult({ ...raw, byPath: raw.byPath ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <Card data-testid="query-search-section">
        <CardHeader>
          <CardTitle>Query Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                Glob Pattern
              </label>
              <Input
                placeholder="e.g. vacation/*/food"
                value={glob}
                onChange={(e) => setGlob(e.target.value)}
                data-testid="query-glob-input"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="query-start-date"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="query-end-date"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={searching || !glob.trim()}
              data-testid="query-search-button"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
      >
        <DialogContent
          data-testid="query-results-dialog"
          className="sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Query Results</DialogTitle>
            <DialogDescription>
              {result?.transactions.length ?? 0} transactions matched
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 text-sm font-medium">
            <span className="text-income" data-testid="query-total-income">
              Income: {result?.totalIncome.toFixed(2)}
            </span>
            <span className="text-expense" data-testid="query-total-expense">
              Expense: {result?.totalExpense.toFixed(2)}
            </span>
          </div>
          {result?.byPath && result.byPath.length > 0 && (
            <div data-testid="query-by-path" className="space-y-1">
              {result.byPath.map((p) => (
                <div
                  key={p.path}
                  className="flex items-center justify-between text-xs"
                  data-testid={`query-path-${p.path}`}
                >
                  <span className="text-muted-foreground font-mono">
                    {p.path}
                  </span>
                  <span className="flex gap-3 shrink-0">
                    {p.totalIncome > 0 && (
                      <span className="text-income">
                        +{p.totalIncome.toFixed(2)}
                      </span>
                    )}
                    {p.totalExpense > 0 && (
                      <span className="text-expense">
                        -{p.totalExpense.toFixed(2)}
                      </span>
                    )}
                    <span className="text-muted-foreground">{p.count} tx</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {result?.transactions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No transactions found.
              </p>
            )}
            {result?.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex justify-between text-sm border-b border-border py-1"
                data-testid={`query-tx-${tx.id}`}
              >
                <span className="truncate">
                  {tx.booking_date} · {tx.counterparty_name ?? "—"}
                </span>
                <span
                  className={
                    tx.credit_debit === "CRDT" ? "text-income" : "text-expense"
                  }
                >
                  {tx.credit_debit === "DBIT" ? "-" : "+"}
                  {tx.amount} {tx.currency}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
