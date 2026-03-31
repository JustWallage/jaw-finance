import { Loader2, RefreshCw, Link as LinkIcon, AlertTriangle } from "lucide-react";
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
import { useBankConnection } from "./hooks/useBankConnection";

export default function App() {
  const {
    transactions,
    loading,
    error,
    activeConnection,
    expiringSoon,
    handleConnect,
    handleRefresh,
  } = useBankConnection();

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background p-8 text-foreground dark">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">jaw-finance</h1>
          <p className="mt-2 text-muted-foreground">Personal finance dashboard.</p>
        </div>

        {error && (
          <Alert variant="destructive" data-testid="error-alert">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {expiringSoon && (
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
                onClick={handleRefresh}
                disabled={loading !== null}
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
                disabled={loading !== null}
                size="lg"
                data-testid="reconnect-button"
              >
                Reconnect
              </Button>
            </>
          )}
        </div>

        {activeConnection && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Connected to {activeConnection.aspsp_name}
                <Badge variant="secondary">{activeConnection.aspsp_country}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {activeConnection.iban && <p>IBAN: {activeConnection.iban}</p>}
              <p>
                Valid until:{" "}
                {new Date(activeConnection.valid_until).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
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
