import { useState } from "react";
import { Loader2, BotMessageSquare } from "lucide-react";
import { motion } from "motion/react";
import type { DBTag } from "../../db/types";
import { apiFetch } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { TagDetailDialog } from "../components/tags/TagDetailDialog";
import { TagQuerySearch } from "../components/tags/TagQuerySearch";
import { useBankConnectionContext } from "../components/BankConnectionProvider";
import { useIncomeAnalytics } from "../hooks/useIncomeAnalytics";
import { useTagManagement } from "../hooks/useTagManagement";
import { usePendingCount } from "../hooks/usePendingCount";
import { useAmbiguousCount } from "../hooks/useAmbiguousCount";
import { useOutletContext, useNavigate } from "react-router-dom";

export default function TagsPage() {
  const navigate = useNavigate();
  const { selectedAccountUid } = useBankConnectionContext();
  const { hideIncome } = useOutletContext<{ hideIncome: boolean }>();
  const { currentMonthIncome, currentMonthExpense, pastMonths } =
    useIncomeAnalytics(selectedAccountUid);

  const { tags, rejected, loading, refresh } = useTagManagement();
  const [selectedTag, setSelectedTag] = useState<DBTag | null>(null);

  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const { pendingCount, fetchPendingCount } = usePendingCount();
  const { ambiguousCount } = useAmbiguousCount(selectedAccountUid);

  const unconfirmed = tags.filter((t) => t.status === "unconfirmed");
  const confirmed = tags.filter((t) => t.status === "confirmed");

  async function handleBatchEvaluate() {
    setBatchEvaluating(true);
    try {
      await apiFetch("/api/transactions/evaluate-batch", {
        method: "POST",
        headers: {
          ...(import.meta.env.VITE_MOCK_AI === "1"
            ? { "X-Test-Mock-AI": "1" }
            : {}),
        },
      }).catch(() => {});
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
