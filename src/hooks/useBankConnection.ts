import { useEffect, useRef, useState, useCallback } from "react";
import type { DBBankConnection, DBTransaction } from "../../db/types";
import { useLocalStorage } from "./useLocalStorage";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

function authHeaders(): HeadersInit {
  const email = import.meta.env.VITE_DEV_USER_EMAIL;
  return email ? { "Cf-Access-Authenticated-User-Email": email } : {};
}

/** Subset of DBBankConnection fields returned by the status API. */
export type Connection = Pick<
  DBBankConnection,
  | "id"
  | "account_uid"
  | "aspsp_name"
  | "aspsp_country"
  | "iban"
  | "nickname"
  | "valid_until"
  | "oldest_synced_date"
  | "last_refreshed_at"
>;

/** Subset of DBTransaction fields returned by the transactions API. */
export type Transaction = Pick<
  DBTransaction,
  | "id"
  | "account_uid"
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedAccountUid, setSelectedAccountUid] = useLocalStorage<string>(
    "jaw-finance-selected-account",
    "",
  );
  const importAbort = useRef<AbortController | null>(null);
  const lastRefreshAttempt = useRef<number>(0);

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
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/bank/status", { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as {
        connections: Connection[];
        user_email?: string;
      };
      setConnections(data.connections);
      if (data.user_email) setUserEmail(data.user_email);
    } catch {
      /* ignore on load */
    }
  }

  // Resolve selected account when connections change, then fetch transactions
  useEffect(() => {
    if (connections.length === 0) return;
    const valid =
      selectedAccountUid === "all" ||
      connections.some((c) => c.account_uid === selectedAccountUid);
    if (!valid) {
      // This triggers the selectedAccountUid effect which will fetch
      setSelectedAccountUid(connections[0].account_uid);
    } else {
      fetchTransactions(
        undefined,
        selectedAccountUid || connections[0].account_uid,
      );
    }
  }, [connections]);

  // Re-fetch transactions when selected account changes (user switching)
  const connectionsLoaded = connections.length > 0;
  useEffect(() => {
    if (!connectionsLoaded || !selectedAccountUid) return;
    fetchTransactions(undefined, selectedAccountUid);
  }, [selectedAccountUid]);

  // Auto-refresh on mount when connections are stale (>2h) and no recent attempt (<5min)
  const autoRefreshTriggered = useRef(false);
  useEffect(() => {
    if (autoRefreshTriggered.current) return;
    if (connections.length === 0) return;
    const active = connections.filter(
      (c) => new Date(c.valid_until).getTime() > Date.now(),
    );
    if (active.length === 0) return;

    const oldestRefresh = active.reduce<number | null>((oldest, c) => {
      if (!c.last_refreshed_at) return 0; // NULL = never refreshed = infinitely stale
      const ts = new Date(c.last_refreshed_at + "Z").getTime();
      if (oldest === null) return ts;
      return ts < oldest ? ts : oldest;
    }, null);

    if (oldestRefresh === null) return;

    const isStale = Date.now() - oldestRefresh > TWO_HOURS;
    const recentAttempt = Date.now() - lastRefreshAttempt.current < FIVE_MINUTES;

    if (isStale && !recentAttempt) {
      autoRefreshTriggered.current = true;
      handleRefresh();
    }
  }, [connections]);

  async function fetchTransactions(since?: string, accountUid?: string) {
    try {
      const params = new URLSearchParams();
      if (since) params.set("since", since);
      const effectiveAccount = accountUid ?? selectedAccountUid;
      if (effectiveAccount && effectiveAccount !== "all") {
        params.set("account_uid", effectiveAccount);
      }
      const qs = params.toString();
      const url = qs
        ? `/api/bank/transactions?${qs}`
        : "/api/bank/transactions";
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { transactions: Transaction[] };
      if (since) {
        setTransactions((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTxns = data.transactions.filter(
            (t) => !existingIds.has(t.id),
          );
          return [...newTxns, ...prev];
        });
      } else {
        setTransactions(data.transactions);
      }
    } catch {
      /* ignore on load */
    }
  }

  async function handleConnect(aspsp: { name: string; country: string }) {
    setLoading("connect");
    setError("");
    try {
      const res = await fetch("/api/bank/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ aspsp }),
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
    lastRefreshAttempt.current = Date.now();
    try {
      const latestDate = transactions[0]?.booking_date ?? undefined;
      const res = await fetch("/api/bank/refresh", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = (await res.json()) as { synced?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Refresh failed");
      }
      await fetchStatus();
      await fetchTransactions(latestDate, selectedAccountUid);
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
    const targetDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - months,
        now.getUTCDate(),
      ),
    );

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
        const chunkStart = new Date(
          Math.max(cursor.getTime(), targetDate.getTime()),
        );

        const dateFrom = chunkStart.toISOString().split("T")[0];
        const dateTo = chunkEnd.toISOString().split("T")[0];

        const monthLabel = chunkStart.toLocaleString("default", {
          month: "short",
          year: "numeric",
        });
        setImportProgress(`Importing: ${monthLabel}…`);

        const res = await fetch("/api/bank/import", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
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
      await fetchTransactions(undefined, selectedAccountUid);
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
    userEmail,
    selectedAccountUid,
    setSelectedAccountUid,
    handleConnect,
    handleRefresh,
    handleImportHistory,
    fetchStatus,
  } as const;
}
