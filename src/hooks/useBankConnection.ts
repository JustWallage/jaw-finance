import { useEffect, useRef, useState } from "react";
import type { DBBankConnection, DBTransaction } from "../../db/types";

/** Subset of DBBankConnection fields returned by the status API. */
export type Connection = Pick<
  DBBankConnection,
  "id" | "account_uid" | "aspsp_name" | "aspsp_country" | "iban" | "valid_until" | "oldest_synced_date"
>;

/** Subset of DBTransaction fields returned by the transactions API. */
export type Transaction = Pick<
  DBTransaction,
  | "id"
  | "amount"
  | "currency"
  | "credit_debit"
  | "status"
  | "booking_date"
  | "counterparty_name"
  | "remittance_info"
>;

const DAYS_14 = 14 * 24 * 60 * 60 * 1000;

export function useBankConnection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<"connect" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const importAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bank_error")) {
      setError(params.get("bank_error")!);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("connected")) {
      window.history.replaceState({}, "", "/");
    }
    fetchStatus();
    fetchTransactions();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/bank/status");
      const data = (await res.json()) as { connections: Connection[] };
      setConnections(data.connections);
    } catch {
      /* ignore on load */
    }
  }

  async function fetchTransactions() {
    try {
      const res = await fetch("/api/bank/transactions");
      const data = (await res.json()) as { transactions: Transaction[] };
      setTransactions(data.transactions);
    } catch {
      /* ignore on load */
    }
  }

  async function handleConnect() {
    setLoading("connect");
    setError("");
    try {
      const res = await fetch("/api/bank/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspsp: { name: "bunq", country: "NL" } }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Failed to start bank connection");
        setLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(null);
    }
  }

  async function handleRefresh() {
    setLoading("refresh");
    setError("");
    try {
      const res = await fetch("/api/bank/refresh", { method: "POST" });
      const data = (await res.json()) as { synced?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Refresh failed");
      }
      await fetchTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(null);
    }
  }

  const activeConnection = connections.find(
    (c) => new Date(c.valid_until).getTime() > Date.now(),
  );
  const expiringSoon =
    activeConnection != null &&
    new Date(activeConnection.valid_until).getTime() - Date.now() < DAYS_14;

  async function handleImportHistory(months: number) {
    if (!activeConnection) return;

    const now = new Date();
    const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));

    // Already synced far enough back — nothing to do
    if (
      activeConnection.oldest_synced_date &&
      new Date(activeConnection.oldest_synced_date + "T00:00:00Z") <= targetDate
    ) {
      return;
    }

    importAbort.current = new AbortController();
    setImportProgress("Starting import…");
    setError("");

    // Start from the oldest synced point (or today if never synced)
    const cursor = activeConnection.oldest_synced_date
      ? new Date(activeConnection.oldest_synced_date + "T00:00:00Z")
      : new Date();

    try {
      while (cursor > targetDate) {
        if (importAbort.current.signal.aborted) break;

        const chunkEnd = new Date(cursor);
        cursor.setUTCMonth(cursor.getUTCMonth() - 1);
        const chunkStart = new Date(Math.max(cursor.getTime(), targetDate.getTime()));

        const dateFrom = chunkStart.toISOString().split("T")[0];
        const dateTo = chunkEnd.toISOString().split("T")[0];

        const monthLabel = chunkStart.toLocaleString("default", {
          month: "short",
          year: "numeric",
        });
        setImportProgress(`Importing: ${monthLabel}…`);

        const res = await fetch("/api/bank/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_uid: activeConnection.account_uid,
            date_from: dateFrom,
            date_to: dateTo,
          }),
        });

        const data = (await res.json()) as {
          synced?: number;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Import failed");
          break;
        }
      }

      await fetchStatus();
      await fetchTransactions();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    } finally {
      setImportProgress(null);
      importAbort.current = null;
    }
  }

  return {
    connections,
    transactions,
    loading,
    error,
    activeConnection,
    expiringSoon,
    importProgress,
    handleConnect,
    handleRefresh,
    handleImportHistory,
  } as const;
}
