import { useState } from "react";
import { Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "../../lib/api";

export function MerchantDictionaryCard() {
  const [evaluating, setEvaluating] = useState<"pending" | "force" | null>(
    null,
  );
  const [result, setResult] = useState<string | null>(null);

  async function runMerchantEval(
    kind: "pending" | "force",
    url: string,
    resultText: (evaluated: number) => string,
  ) {
    setEvaluating(kind);
    setResult(null);
    try {
      const data = await apiFetch<{ evaluated: number }>(url, {
        method: "POST",
      });
      setResult(resultText(data.evaluated));
    } catch {
      setResult("Failed to evaluate");
    } finally {
      setEvaluating(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Merchant Dictionary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Auto-tag transactions by matching merchant names against the global
          pattern dictionary.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              runMerchantEval(
                "pending",
                "/api/transactions/evaluate-merchant-pending",
                (n) => `Evaluated ${n} pending transactions`,
              )
            }
            disabled={evaluating !== null}
            data-testid="merchant-evaluate-pending"
          >
            {evaluating === "pending" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Evaluate Pending
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              runMerchantEval(
                "force",
                "/api/transactions/evaluate-merchant-all-force",
                (n) => `Re-evaluated ${n} transactions`,
              )
            }
            disabled={evaluating !== null}
            data-testid="merchant-evaluate-force"
          >
            {evaluating === "force" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Re-evaluate All
          </Button>
        </div>
        {result && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="merchant-result"
          >
            {result}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
