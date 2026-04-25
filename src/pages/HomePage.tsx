import { useState, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Link as LinkIcon, AlertTriangle, History, User, TrendingUp, TrendingDown, Eye, EyeOff, Sparkles, MessageCircle, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBankConnection } from "../hooks/useBankConnection";
import { useIncomeAnalytics } from "../hooks/useIncomeAnalytics";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useTags } from "../hooks/useTags";
import { TagSelector } from "../components/TagSelector";
import { authHeaders } from "../lib/auth-headers";
import type { DBTag, DBTransaction } from "../../db/types";

export default function HomePage() {
  const {
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
  } = useBankConnection();

  const accountLabel = (uid: string) => {
    if (uid === "all") return "All Accounts";
    const c = connections.find((conn) => conn.account_uid === uid);
    return c?.iban ?? uid;
  };

  const selectedConnection = connections.find(
    (c) => c.account_uid === selectedAccountUid,
  );

  const { currentMonthIncome, currentMonthExpense, pastMonths, refresh: refreshAnalytics } =
    useIncomeAnalytics(selectedAccountUid);

  const [hideIncome, setHideIncome] = useLocalStorage("jaw-finance-hide-income", false);

  const { tags, fetchTags, createTag, deleteTag, getTagCount, getTransactionTags, assignTag, removeTag } = useTags();
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [selectedTxTags, setSelectedTxTags] = useState<DBTag[]>([]);

  const selectedTx = transactions.find((tx) => tx.id === selectedTxId) ?? null;

  const openTransaction = useCallback(async (txId: number) => {
    setSelectedTxId(txId);
    const txTagList = await getTransactionTags(txId);
    setSelectedTxTags(txTagList);
  }, [getTransactionTags]);

  const handleTagsChanged = useCallback(async () => {
    if (selectedTxId) {
      const txTagList = await getTransactionTags(selectedTxId);
      setSelectedTxTags(txTagList);
    }
    fetchTags();
  }, [selectedTxId, getTransactionTags, fetchTags]);

  const formatPeriod = (period: string) => {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  const displayedTransactions = transactions;

  const [evaluating, setEvaluating] = useState(false);

  const [chatQuestion, setChatQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<{
    summary: string;
    transactions: DBTransaction[];
    totalIncome: number;
    totalExpense: number;
  } | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  async function handleChatSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatQuestion.trim() || chatLoading) return;
    setChatLoading(true);
    setChatResult(null);
    setChatExpanded(false);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
          "X-Test-Mock-AI": import.meta.env.VITE_MOCK_AI === "1" ? "1" : "",
        },
        body: JSON.stringify({ question: chatQuestion.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        summary: string;
        transactions: DBTransaction[];
        totalIncome: number;
        totalExpense: number;
      };
      if (data.error) throw new Error(data.error);
      setChatResult(data);
    } catch {
      setChatResult({
        summary: "Something went wrong. Please try again.",
        transactions: [],
        totalIncome: 0,
        totalExpense: 0,
      });
    } finally {
      setChatLoading(false);
    }
  }

  async function handleEvaluate() {
    if (!selectedTxId) return;
    setEvaluating(true);
    try {
      await fetch(`/api/transactions/${selectedTxId}/evaluate`, {
        method: "POST",
        headers: { ...authHeaders(), "X-Test-Mock-AI": import.meta.env.VITE_MOCK_AI === "1" ? "1" : "" },
      });
      await handleTagsChanged();
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">JAW Finance</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHideIncome(!hideIncome)}
              data-testid="toggle-income"
              title={hideIncome ? "Show income" : "Hide income"}
            >
              {hideIncome ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {activeConnection && (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await handleRefresh();
                  refreshAnalytics();
                }}
                disabled={loading !== null || importProgress !== null}
                data-testid="refresh-button"
              >
                {loading === "refresh" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
            {connections.length > 0 && (
              <Select
                value={selectedAccountUid}
                onValueChange={(value) => {
                  if (value) setSelectedAccountUid(value);
                }}
              >
                <SelectTrigger data-testid="account-switcher">
                  <SelectValue>
                    {accountLabel(selectedAccountUid)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="account-option-all">
                    All Accounts
                  </SelectItem>
                  {connections.map((c) => (
                    <SelectItem
                      key={c.account_uid}
                      value={c.account_uid}
                      data-testid={`account-option-${c.account_uid}`}
                    >
                      {c.iban ?? c.account_uid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog>
              <DialogTrigger
                render={
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-sm text-muted-foreground hover:bg-muted/80 cursor-pointer"
                    data-testid="user-menu-trigger"
                  >
                    <User className="h-3.5 w-3.5" />
                    {userEmail ?? "Account"}
                  </button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bank Connection</DialogTitle>
                  <DialogDescription>
                    Manage your bank connections and import history.
                  </DialogDescription>
                </DialogHeader>

                {selectedConnection && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">
                      Connected to {selectedConnection.aspsp_name}
                      <Badge variant="secondary" className="ml-2">{selectedConnection.aspsp_country}</Badge>
                    </p>
                    {selectedConnection.iban && <p>IBAN: {selectedConnection.iban}</p>}
                    <p>
                      Valid until:{" "}
                      {new Date(selectedConnection.valid_until).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {!activeConnection ? (
                    <Button
                      onClick={handleConnect}
                      disabled={loading !== null}
                      data-testid="connect-button"
                    >
                      {loading === "connect" ? (
                        <>
                          <Loader2 className="animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4" />
                          Connect Bank
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleConnect}
                        disabled={loading !== null || importProgress !== null}
                        data-testid="reconnect-button"
                      >
                        Reconnect
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={loading !== null || importProgress !== null}
                          data-testid="import-history-button"
                          render={
                            <Button variant="outline">
                              <History className="h-4 w-4" />
                              Import History
                            </Button>
                          }
                        />
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            data-testid="import-3m"
                            onClick={() => handleImportHistory(3)}
                          >
                            3 Months
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid="import-1y"
                            onClick={() => handleImportHistory(12)}
                          >
                            1 Year
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid="import-5y"
                            onClick={() => handleImportHistory(60)}
                          >
                            5 Years
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {activeConnection && (
          <form onSubmit={handleChatSubmit} data-testid="chat-form" className="flex gap-2">
            <Input
              ref={chatInputRef}
              placeholder="Ask about your finances..."
              value={chatQuestion}
              onChange={(e) => setChatQuestion((e.target as HTMLInputElement).value)}
              disabled={chatLoading}
              data-testid="chat-input"
              className="flex-1"
            />
            <Button type="submit" disabled={chatLoading || !chatQuestion.trim()} data-testid="chat-submit">
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        )}

        {chatResult && (
          <Card data-testid="chat-result-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Answer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p data-testid="chat-summary" className="text-sm">{chatResult.summary}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span data-testid="chat-total-income" className="text-green-500">
                  +{chatResult.totalIncome.toFixed(2)} EUR
                </span>
                <span data-testid="chat-total-expense" className="text-red-500">
                  -{chatResult.totalExpense.toFixed(2)} EUR
                </span>
              </div>
              {chatResult.transactions.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChatExpanded(!chatExpanded)}
                  data-testid="chat-toggle-transactions"
                >
                  {chatExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  {chatExpanded ? "Hide" : "View all"} {chatResult.transactions.length} transactions
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No transactions matched.</p>
              )}
              {chatExpanded && (
                <Table data-testid="chat-transactions-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Counterparty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatResult.transactions.map((tx) => (
                      <TableRow key={tx.id} data-testid={`chat-tx-${tx.id}`}>
                        <TableCell className="whitespace-nowrap">{tx.booking_date ?? "—"}</TableCell>
                        <TableCell>{tx.counterparty_name ?? "—"}</TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${tx.credit_debit === "CRDT" ? "text-green-500" : "text-red-500"}`}>
                          {tx.credit_debit === "DBIT" ? "-" : "+"}{tx.amount} {tx.currency}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive" data-testid="error-alert">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {expiringSoon && activeConnection && (
          <Alert data-testid="expiry-warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Connection expiring soon</AlertTitle>
            <AlertDescription>
              Your bank connection expires on{" "}
              {new Date(activeConnection.valid_until).toLocaleDateString()}.
              Please reconnect.
            </AlertDescription>
          </Alert>
        )}

        {importProgress && (
          <div
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            data-testid="import-progress"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {importProgress}
          </div>
        )}

        {!activeConnection && (
          <div className="flex justify-center">
            <Button
              onClick={handleConnect}
              disabled={loading !== null}
              size="lg"
              data-testid="connect-button"
            >
              {loading === "connect" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  Connect Bank
                </>
              )}
            </Button>
          </div>
        )}

        {currentMonthIncome !== null && (
          <div className="grid grid-cols-2 gap-4">
            <Card data-testid="income-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">This month</p>
                  <p className={`text-3xl font-bold text-green-500 ${hideIncome ? "blur-md select-none" : ""}`} data-testid="current-month-income">
                    +{currentMonthIncome.toFixed(2)} EUR
                  </p>
                </div>
                {pastMonths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Past months</p>
                    {pastMonths.map((m) => (
                      <div
                        key={m.period}
                        className="flex items-center justify-between text-sm"
                        data-testid={`income-month-${m.period}`}
                      >
                        <span className="text-muted-foreground">{formatPeriod(m.period)}</span>
                        <span className={`font-medium text-green-500 ${hideIncome ? "blur-md select-none" : ""}`}>
                          {m.income.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="expense-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5" />
                  Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">This month</p>
                  <p className="text-3xl font-bold text-red-500" data-testid="current-month-expense">
                    -{(currentMonthExpense ?? 0).toFixed(2)} EUR
                  </p>
                </div>
                {pastMonths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Past months</p>
                    {pastMonths.map((m) => (
                      <div
                        key={m.period}
                        className="flex items-center justify-between text-sm"
                        data-testid={`expense-month-${m.period}`}
                      >
                        <span className="text-muted-foreground">{formatPeriod(m.period)}</span>
                        <span className="font-medium text-red-500">
                          {m.expense.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {displayedTransactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="transactions-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedTransactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer"
                      onClick={() => openTransaction(tx.id)}
                      data-testid={`tx-row-${tx.id}`}
                    >
                      <TableCell className="whitespace-nowrap">
                        {tx.booking_date ?? "—"}
                      </TableCell>
                      <TableCell>{tx.counterparty_name ?? "—"}</TableCell>
                      <TableCell className="max-w-50 truncate">
                        {tx.remittance_info ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right whitespace-nowrap ${
                          tx.credit_debit === "CRDT"
                            ? "text-green-500"
                            : "text-red-500"
                        } ${hideIncome && tx.credit_debit === "CRDT" ? "blur-md select-none" : ""}`}
                      >
                        {tx.credit_debit === "DBIT" ? "-" : "+"}
                        {tx.amount} {tx.currency}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.status === "BOOK" ? "default" : "secondary"}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      <Dialog open={selectedTx !== null} onOpenChange={(open) => { if (!open) setSelectedTxId(null); }}>
        <DialogContent data-testid="transaction-dialog">
          <DialogHeader>
            <DialogTitle>{selectedTx?.counterparty_name ?? "Transaction"}</DialogTitle>
            <DialogDescription>
              {selectedTx?.booking_date} · {selectedTx?.credit_debit === "DBIT" ? "-" : "+"}{selectedTx?.amount} {selectedTx?.currency}
            </DialogDescription>
          </DialogHeader>
          {selectedTx?.remittance_info && (
            <p className="text-sm text-muted-foreground">{selectedTx.remittance_info}</p>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Tags</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEvaluate}
                disabled={evaluating}
                data-testid="ai-evaluate-button"
              >
                {evaluating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
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
        </DialogContent>
      </Dialog>
    </>
  );
}
