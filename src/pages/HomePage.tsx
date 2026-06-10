import { useState, useCallback, useEffect } from "react";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  Loader2,
  Send,
  Sparkles,
  LinkIcon,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useBankConnectionContext } from "../components/BankConnectionProvider";
import { useIncomeAnalytics } from "../hooks/useIncomeAnalytics";
import { useTags } from "../hooks/useTags";
import { useAmbiguousCount } from "../hooks/useAmbiguousCount";
import { TagSelector } from "../components/TagSelector";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { Skeleton } from "../components/ui/skeleton";
import { TransactionFeed } from "../components/TransactionFeed";
import { AmbiguousBanner } from "../components/AmbiguousBanner";
import { ClarifyModal } from "../components/ClarifyModal";
import { apiFetch } from "../lib/api";
import type { DBTag } from "../../db/types";
import type { Transaction } from "../hooks/useBankConnection";

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hideIncome } = useOutletContext<{ hideIncome: boolean }>();

  const {
    connections,
    transactions,
    loading,
    activeConnection,
    selectedAccountUid,
    handleRefresh,
  } = useBankConnectionContext();

  const { currentMonthIncome, currentMonthExpense, pastMonths } =
    useIncomeAnalytics(selectedAccountUid);

  const {
    tags,
    fetchTags,
    createTag,
    deleteTag,
    getTagCount,
    getTransactionTags,
    assignTag,
    removeTag,
  } = useTags();
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [selectedTxTags, setSelectedTxTags] = useState<DBTag[]>([]);

  const selectedTx = transactions.find((tx) => tx.id === selectedTxId) ?? null;

  const openTransaction = useCallback(
    async (txId: number) => {
      setSelectedTxId(txId);
      const txTagList = await getTransactionTags(txId);
      setSelectedTxTags(txTagList);
    },
    [getTransactionTags],
  );

  // Ambiguous transactions
  const { ambiguousCount, fetchAmbiguousCount } =
    useAmbiguousCount(selectedAccountUid);
  const [ambiguousTxs, setAmbiguousTxs] = useState<Transaction[]>([]);
  const [clarifyOpen, setClarifyOpen] = useState(false);

  // Auto-open clarify modal from query param (e.g. from TagsPage)
  useEffect(() => {
    if (searchParams.get("clarify") === "1") {
      openClarifyModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function openClarifyModal() {
    const params = selectedAccountUid
      ? `?account_uid=${selectedAccountUid}`
      : "";
    const data = await apiFetch<{ transactions: Transaction[] }>(
      `/api/transactions/ambiguous${params}`,
    );
    setAmbiguousTxs(data.transactions);
    setClarifyOpen(true);
  }

  function handleClarifyResolved() {
    fetchAmbiguousCount();
  }

  const handleTagsChanged = useCallback(async () => {
    if (selectedTxId) {
      const txTagList = await getTransactionTags(selectedTxId);
      setSelectedTxTags(txTagList);
    }
    fetchTags();
    fetchAmbiguousCount();
  }, [selectedTxId, getTransactionTags, fetchTags, fetchAmbiguousCount]);

  const [evaluating, setEvaluating] = useState(false);

  async function handleEvaluate() {
    if (!selectedTxId) return;
    setEvaluating(true);
    try {
      await apiFetch(`/api/transactions/${selectedTxId}/evaluate`, {
        method: "POST",
        headers: {
          ...(import.meta.env.VITE_MOCK_AI === "1"
            ? { "X-Test-Mock-AI": "1" }
            : {}),
        },
      });
      await handleTagsChanged();
    } finally {
      setEvaluating(false);
    }
  }

  // Chat input that navigates to chat page
  const [chatQuestion, setChatQuestion] = useState("");

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatQuestion.trim()) return;
    navigate(`/app/chat?q=${encodeURIComponent(chatQuestion.trim())}`);
  }

  // Build chart data
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

  const hasData = connections.length > 0 && activeConnection;
  const hasExpiredConnection = connections.length > 0 && !activeConnection;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Chat Hero */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="space-y-2"
      >
        <h2 className="text-lg font-semibold tracking-tight">
          Ask your finances
        </h2>
        <div className="rounded-2xl bg-linear-to-r from-primary/20 via-primary/10 to-primary/20 p-px">
          <form
            onSubmit={handleChatSubmit}
            data-testid="chat-form"
            className="relative"
          >
            <Input
              placeholder={
                hasData
                  ? "e.g. How much did I spend on food this month?"
                  : "Connect a bank to get started"
              }
              value={chatQuestion}
              onChange={(e) => setChatQuestion(e.target.value)}
              disabled={!hasData}
              data-testid="chat-input"
              className="h-14 pl-5 pr-14 text-base rounded-2xl border-0 bg-background focus-visible:ring-primary/40"
            />
            <Button
              type="submit"
              disabled={!hasData || !chatQuestion.trim()}
              data-testid="chat-submit"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-lg"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </motion.div>

      {hasExpiredConnection && (
        <Alert variant="destructive" data-testid="expired-connection-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bank connection expired</AlertTitle>
          <AlertDescription>
            Your bank connection has expired. Reconnect to continue syncing
            transactions.
          </AlertDescription>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => navigate("/app/settings")}
            data-testid="expired-connection-reconnect-button"
            className="justify-self-start mt-2"
          >
            Reconnect
          </Button>
        </Alert>
      )}

      {/* Empty state — feature preview */}
      {!hasData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="relative">
            {/* Blurred mock content */}
            <div className="pointer-events-none select-none blur-sm opacity-50 space-y-4">
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Income this month
                  </p>
                  <p className="text-2xl font-bold text-income">
                    +3,245.00 EUR
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Expenses this month
                  </p>
                  <p className="text-2xl font-bold text-expense">
                    -1,876.50 EUR
                  </p>
                </div>
              </div>
              <div className="h-40 rounded-lg bg-muted" />
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1 space-y-1">
                    <div className="h-3.5 w-32 rounded bg-muted" />
                    <div className="h-2.5 w-48 rounded bg-muted" />
                  </div>
                  <div className="h-3.5 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
            {/* CTA overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center gap-3 py-6 px-8">
                  <LinkIcon className="h-8 w-8 text-primary" />
                  <p className="text-sm font-medium text-center">
                    Connect your bank account to see your finances
                  </p>
                  <Button
                    onClick={() => navigate("/app/settings")}
                    data-testid="connect-button"
                  >
                    {loading === "connect" ? (
                      <>
                        <Loader2 className="animate-spin" /> Connecting…
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4" /> Connect Bank
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      )}

      {/* Chart */}
      {hasData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-zinc-900 text-zinc-100 border-zinc-700">
            <CardContent className="pt-6">
              {currentMonthIncome !== null ? (
                <IncomeExpenseChart
                  data={chartData}
                  currentIncome={currentMonthIncome}
                  currentExpense={currentMonthExpense ?? 0}
                  hideIncome={hideIncome}
                  compact
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
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Ambiguous Banner */}
      {hasData && ambiguousCount > 0 && (
        <AmbiguousBanner count={ambiguousCount} onClick={openClarifyModal} />
      )}

      {/* Refresh Button + Transaction Feed */}
      {hasData && transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-2"
        >
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={loading === "refresh"}
              data-testid="refresh-transactions-button"
              className="h-8 w-8"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading === "refresh" ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <TransactionFeed
            transactions={transactions}
            onSelect={openTransaction}
            hideIncome={hideIncome}
          />
        </motion.div>
      )}

      {/* Transaction Detail Bottom Sheet */}
      <Drawer
        open={selectedTx !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTxId(null);
        }}
      >
        <DrawerContent data-testid="transaction-dialog">
          <div className="max-h-[70vh] overflow-y-auto px-6 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle className="text-lg">
                {selectedTx?.counterparty_name ?? "Transaction"}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Transaction details
              </DrawerDescription>
            </DrawerHeader>

            {/* Amount hero */}
            <p
              className={`text-3xl font-bold tracking-tight mt-2 ${selectedTx?.credit_debit === "DBIT" ? "text-expense" : "text-income"}`}
            >
              {selectedTx?.credit_debit === "DBIT" ? "-" : "+"}
              {selectedTx?.amount} {selectedTx?.currency}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedTx?.booking_date}
            </p>

            {/* Remittance info */}
            {selectedTx?.remittance_info && (
              <p className="text-sm text-muted-foreground mt-4 rounded-lg bg-muted/50 px-3 py-2">
                {selectedTx.remittance_info}
              </p>
            )}

            {/* Divider */}
            <div className="border-t my-5" />

            {/* Tags */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Tags</p>
                <Button
                  size="sm"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                  data-testid="ai-evaluate-button"
                  className="gap-1.5"
                >
                  {evaluating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI Evaluate
                </Button>
              </div>
              {selectedTx && (
                <TagSelector
                  transactionId={selectedTx.id}
                  assignedTags={selectedTxTags}
                  allTags={tags}
                  onAssign={assignTag}
                  onRemove={removeTag}
                  onDelete={deleteTag}
                  onCreate={createTag}
                  getTagCount={getTagCount}
                  onTagsChanged={handleTagsChanged}
                />
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Clarify Modal */}
      <ClarifyModal
        open={clarifyOpen}
        onOpenChange={setClarifyOpen}
        transactions={ambiguousTxs}
        tags={tags}
        onAssignTag={assignTag}
        onRemoveTag={removeTag}
        onDeleteTag={deleteTag}
        onCreateTag={createTag}
        getTagCount={getTagCount}
        getTransactionTags={getTransactionTags}
        onResolved={handleClarifyResolved}
      />
    </motion.div>
  );
}
