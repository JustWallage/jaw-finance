import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type FetchState = "idle" | "loading" | "success" | "error";

type BunqPaymentEntry = { Payment: Record<string, unknown> };
type TransactionsResponse = { transactions: BunqPaymentEntry[] };

export default function App() {
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleFetch() {
    setFetchState("loading");
    setData(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/bunq/transactions");
      const json = (await res.json()) as TransactionsResponse | { error: string };

      if (!res.ok) {
        setErrorMsg(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        );
        setFetchState("error");
        return;
      }

      setData(json as TransactionsResponse);
      setFetchState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setFetchState("error");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-950 p-8 text-white">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">jaw-finance</h1>
          <p className="mt-2 text-zinc-400">Personal finance dashboard.</p>
        </div>

        <div className="flex justify-center">
          <Button
            onClick={handleFetch}
            disabled={fetchState === "loading"}
            size="lg"
          >
            {fetchState === "loading" ? (
              <>
                <Loader2 className="animate-spin" />
                Fetching…
              </>
            ) : (
              "Fetch Recent Transactions"
            )}
          </Button>
        </div>

        {fetchState === "error" && (
          <Card className="border-red-700 bg-red-950/40">
            <CardHeader>
              <CardTitle className="text-red-400">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-300">{errorMsg}</p>
            </CardContent>
          </Card>
        )}

        {fetchState === "success" && data !== null && (
          <Card>
            <CardHeader>
              <CardTitle>Last 24 h Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] w-full rounded-md">
                <pre
                  className="text-xs text-zinc-300"
                  data-testid="transactions-output"
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
