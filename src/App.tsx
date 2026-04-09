import { Loader2, RefreshCw, Link as LinkIcon, AlertTriangle, History, User, TrendingUp, TrendingDown } from "lucide-react";
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
import { useBankConnection } from "./hooks/useBankConnection";
import { useIncomeAnalytics } from "./hooks/useIncomeAnalytics";

export default function App() {
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

  const formatPeriod = (period: string) => {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background p-8 text-foreground dark">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
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
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">jaw-finance</h1>
            <p className="mt-2 text-muted-foreground">Personal finance dashboard.</p>
          </div>
          <div>
            {userEmail && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                {userEmail}
              </span>
            )}
          </div>
        </div>

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

        <div className="flex justify-center gap-3">
          {!activeConnection ? (
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
          ) : (
            <>
              <Button
                onClick={async () => {
                  await handleRefresh();
                  refreshAnalytics();
                }}
                disabled={loading !== null || importProgress !== null}
                size="lg"
                data-testid="refresh-button"
              >
                {loading === "refresh" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Refreshing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Refresh Transactions
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleConnect}
                disabled={loading !== null || importProgress !== null}
                size="lg"
                data-testid="reconnect-button"
              >
                Reconnect
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={loading !== null || importProgress !== null}
                  data-testid="import-history-button"
                  render={
                    <Button variant="outline" size="lg">
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

        {importProgress && (
          <div
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            data-testid="import-progress"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {importProgress}
          </div>
        )}

        {selectedConnection && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Connected to {selectedConnection.aspsp_name}
                <Badge variant="secondary">{selectedConnection.aspsp_country}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {selectedConnection.iban && <p>IBAN: {selectedConnection.iban}</p>}
              <p>
                Valid until:{" "}
                {new Date(selectedConnection.valid_until).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
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
                  <p className="text-3xl font-bold text-green-500" data-testid="current-month-income">
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
                        <span className="font-medium text-green-500">
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

        {transactions.length > 0 && (
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
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
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
                        }`}
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
      </div>
    </div>
  );
}
