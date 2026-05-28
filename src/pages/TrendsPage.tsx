import { useCallback, useEffect, useState } from "react";
import {
  Check,
  X,
  Pencil,
  Loader2,
  Search,
  BotMessageSquare,
} from "lucide-react";
import { motion } from "motion/react";
import type { DBTag, DBTransaction } from "../../db/types";
import { authHeaders } from "../lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { AmbiguousBanner } from "../components/AmbiguousBanner";
import { Skeleton } from "../components/ui/skeleton";
import { useBankConnectionContext } from "../components/BankConnectionProvider";
import { useIncomeAnalytics } from "../hooks/useIncomeAnalytics";
import { useOutletContext, useNavigate } from "react-router-dom";

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

type TagStatus = "confirmed" | "unconfirmed" | "rejected";

async function fetchTagsByStatus(status?: TagStatus): Promise<DBTag[]> {
  const url = status ? `/api/tags?status=${status}` : "/api/tags";
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return [];
  const data = (await res.json()) as { tags: DBTag[] };
  return data.tags;
}

async function fetchTagTransactions(tagId: number): Promise<DBTransaction[]> {
  const res = await fetch(`/api/tags/${tagId}/transactions`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { transactions: DBTransaction[] };
  return data.transactions;
}

async function patchTag(
  tagId: number,
  body: { new_name?: string; status?: TagStatus },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/tags/${tagId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error };
}

function isUserDomainTag(t: DBTag): boolean {
  return t.source !== "system";
}

export default function TrendsPage() {
  const navigate = useNavigate();
  const { selectedAccountUid } = useBankConnectionContext();
  const { hideIncome } = useOutletContext<{ hideIncome: boolean }>();
  const { currentMonthIncome, currentMonthExpense, pastMonths } =
    useIncomeAnalytics(selectedAccountUid);

  const [tags, setTags] = useState<DBTag[]>([]);
  const [rejected, setRejected] = useState<DBTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<DBTag | null>(null);

  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [all, rej] = await Promise.all([
      fetchTagsByStatus(),
      fetchTagsByStatus("rejected"),
    ]);
    setTags(all.filter(isUserDomainTag));
    setRejected(rej.filter(isUserDomainTag));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unconfirmed = tags.filter((t) => t.status === "unconfirmed");
  const confirmed = tags.filter((t) => t.status === "confirmed");

  async function fetchPendingCount() {
    try {
      const res = await fetch("/api/transactions/pending-count", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setPendingCount(data.count);
      }
    } catch {
      /* non-critical */
    }
  }

  useEffect(() => {
    fetchPendingCount();
  }, []);

  const [ambiguousCount, setAmbiguousCount] = useState(0);

  const fetchAmbiguousCount = useCallback(async () => {
    try {
      const params = selectedAccountUid
        ? `?account_uid=${selectedAccountUid}`
        : "";
      const res = await fetch(`/api/transactions/ambiguous-count${params}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setAmbiguousCount(data.count);
      }
    } catch {
      /* non-critical */
    }
  }, [selectedAccountUid]);

  useEffect(() => {
    fetchAmbiguousCount();
  }, [fetchAmbiguousCount]);

  async function handleBatchEvaluate() {
    setBatchEvaluating(true);
    try {
      await fetch("/api/transactions/evaluate-batch", {
        method: "POST",
        headers: {
          ...authHeaders(),
          ...(import.meta.env.VITE_MOCK_AI === "1"
            ? { "X-Test-Mock-AI": "1" }
            : {}),
        },
      });
      await fetchPendingCount();
      refresh();
    } finally {
      setBatchEvaluating(false);
    }
  }

  const chartData = pastMonths.length > 0 ? [...pastMonths].reverse() : [];
  if (currentMonthIncome !== null) {
    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!chartData.some((d) => d.period === currentPeriod)) {
      chartData.push({
        period: currentPeriod,
        income: currentMonthIncome,
        expense: currentMonthExpense ?? 0,
      });
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Trends</h1>

      {/* Chart */}
      <Card className="bg-zinc-900 text-zinc-100 border-zinc-700">
        <CardContent className="pt-6">
          {currentMonthIncome !== null ? (
            <IncomeExpenseChart
              data={chartData}
              currentIncome={currentMonthIncome}
              currentExpense={currentMonthExpense ?? 0}
              hideIncome={hideIncome}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-6">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-7 w-36" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-7 w-36" />
                </div>
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ambiguous Banner */}
      {ambiguousCount > 0 && (
        <AmbiguousBanner
          count={ambiguousCount}
          onClick={() => navigate("/app?clarify=1")}
        />
      )}

      {/* Tag Query */}
      <TagQuerySearch />

      {/* Auto-Tag */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tags</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBatchEvaluate}
            disabled={batchEvaluating}
            data-testid="batch-evaluate-button"
          >
            {batchEvaluating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <BotMessageSquare className="h-3 w-3" />
            )}
            Auto-Tag Pending{pendingCount !== null ? ` (${pendingCount})` : ""}
          </Button>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="view-rejected-button"
                >
                  Rejected ({rejected.length})
                </Button>
              }
            />
            <DialogContent data-testid="rejected-dialog">
              <DialogHeader>
                <DialogTitle>Rejected Tags</DialogTitle>
                <DialogDescription>
                  These tags are banned from future AI suggestions.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                {rejected.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No rejected tags.
                  </p>
                )}
                {rejected.map((t) => (
                  <Badge
                    key={t.id}
                    variant="secondary"
                    data-testid={`rejected-badge-${t.path}`}
                  >
                    {t.path}
                  </Badge>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Unconfirmed */}
      <Card data-testid="unconfirmed-section">
        <CardHeader>
          <CardTitle>Unconfirmed ({unconfirmed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <TagList
            tags={unconfirmed}
            onSelect={setSelectedTag}
            emptyText="No unconfirmed tags."
          />
        </CardContent>
      </Card>

      {/* Confirmed */}
      <Card data-testid="confirmed-section">
        <CardHeader>
          <CardTitle>Confirmed ({confirmed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <TagList
            tags={confirmed}
            onSelect={setSelectedTag}
            emptyText="No confirmed tags."
          />
        </CardContent>
      </Card>

      <TagDetailDialog
        tag={selectedTag}
        onClose={() => setSelectedTag(null)}
        onChanged={async () => {
          await refresh();
          setSelectedTag(null);
        }}
      />
    </motion.div>
  );
}

function TagList({
  tags,
  onSelect,
  emptyText,
}: {
  tags: DBTag[];
  onSelect: (t: DBTag) => void;
  emptyText: string;
}) {
  if (tags.length === 0)
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <Badge
          key={t.id}
          variant={t.status === "unconfirmed" ? "outline" : "secondary"}
          className="cursor-pointer"
          onClick={() => onSelect(t)}
          data-testid={`tag-row-${t.path}`}
        >
          {t.path}
        </Badge>
      ))}
    </div>
  );
}

function TagDetailDialog({
  tag,
  onClose,
  onChanged,
}: {
  tag: DBTag | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [transactions, setTransactions] = useState<DBTransaction[]>([]);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tag) return;
    setEditing(false);
    setError(null);
    setNewName(tag.name);
    fetchTagTransactions(tag.id).then(setTransactions);
  }, [tag]);

  async function handleConfirm() {
    if (!tag) return;
    setBusy(true);
    const res = await patchTag(tag.id, { status: "confirmed" });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Failed");
    else await onChanged();
  }

  async function handleReject() {
    if (!tag) return;
    setBusy(true);
    const res = await patchTag(tag.id, { status: "rejected" });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Failed");
    else await onChanged();
  }

  async function handleSaveEdit() {
    if (!tag) return;
    setBusy(true);
    setError(null);
    const res = await patchTag(tag.id, { new_name: newName.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed");
      return;
    }
    await onChanged();
  }

  return (
    <Dialog
      open={tag !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-testid="tag-detail-dialog">
        <DialogHeader>
          <DialogTitle>{tag?.path}</DialogTitle>
          <DialogDescription>
            Status: {tag?.status} · Source: {tag?.source}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" data-testid="tag-detail-error">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid="tag-edit-input"
              placeholder="New name (no '/')"
            />
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={busy || !newName.trim()}
              data-testid="tag-edit-save"
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tag?.status === "unconfirmed" && (
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={busy}
                data-testid="tag-confirm-button"
              >
                <Check className="h-3 w-3" /> Confirm
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={busy}
              data-testid="tag-reject-button"
            >
              <X className="h-3 w-3" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={busy}
              data-testid="tag-edit-button"
            >
              <Pencil className="h-3 w-3" /> Edit name
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">
            Linked transactions ({transactions.length})
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {transactions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No transactions linked.
              </p>
            )}
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex justify-between text-sm border-b border-border py-1"
                data-testid={`tag-tx-${tx.id}`}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagQuerySearch() {
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
      const res = await fetch("/api/transactions/by-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
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
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Request failed");
      }
      const raw = (await res.json()) as Omit<QueryResult, "byPath"> & {
        byPath?: QueryResult["byPath"];
      };
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
