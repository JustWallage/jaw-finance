import { useState, useCallback, useEffect } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { DBTag } from "../../db/types";
import type { Transaction } from "../hooks/useBankConnection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TagSelector } from "./TagSelector";
import { authHeaders } from "../lib/auth-headers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  tags: DBTag[];
  onAssignTag: (txId: number, tagId: number) => Promise<boolean>;
  onRemoveTag: (txId: number, tagId: number) => Promise<boolean>;
  onDeleteTag: (tagId: number) => Promise<boolean>;
  onCreateTag: (name: string, path: string) => Promise<DBTag | null>;
  getTagCount: (tagId: number) => Promise<number>;
  getTransactionTags: (txId: number) => Promise<DBTag[]>;
  onResolved: () => void;
}

export function ClarifyModal({
  open,
  onOpenChange,
  transactions,
  tags,
  onAssignTag,
  onRemoveTag,
  onDeleteTag,
  onCreateTag,
  getTagCount,
  getTransactionTags,
  onResolved,
}: Props) {
  const [index, setIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txTags, setTxTags] = useState<DBTag[]>([]);
  const [direction, setDirection] = useState(0);

  const tx = transactions[index] ?? null;

  const loadTags = useCallback(
    async (txId: number) => {
      const t = await getTransactionTags(txId);
      setTxTags(t);
    },
    [getTransactionTags],
  );

  const goTo = useCallback(
    (newIndex: number) => {
      setDirection(newIndex > index ? 1 : -1);
      setIndex(newIndex);
      setExplanation("");
      if (transactions[newIndex]) {
        loadTags(transactions[newIndex].id);
      }
    },
    [index, transactions, loadTags],
  );

  const handleOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen && transactions.length > 0) {
        setIndex(0);
        setExplanation("");
        loadTags(transactions[0].id);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, transactions, loadTags],
  );

  // Reset state when modal opens programmatically (controlled prop)
  useEffect(() => {
    if (open && transactions.length > 0) {
      setIndex(0);
      setExplanation("");
      loadTags(transactions[0].id);
    }
  }, [open, transactions]);

  async function handleSubmit() {
    if (!tx || !explanation.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/transactions/${tx.id}/evaluate`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          ...(import.meta.env.VITE_MOCK_AI === "1"
            ? { "X-Test-Mock-AI": "1" }
            : {}),
        },
        body: JSON.stringify({ explanation: explanation.trim() }),
      });
      onResolved();
      // Auto-advance or close
      if (index < transactions.length - 1) {
        goTo(index + 1);
      } else {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleTagsChanged() {
    if (tx) loadTags(tx.id);
    onResolved();
  }

  if (!tx) return null;

  const formatAmount = (t: Transaction) => {
    const sign = t.credit_debit === "CRDT" ? "+" : "-";
    return `${sign}€${Number(t.amount).toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen} disablePointerDismissal>
      <DialogContent className="max-w-lg p-8" data-testid="clarify-modal">
        <DialogHeader>
          <DialogTitle>Clarify Transaction</DialogTitle>
          <DialogDescription>
            {index + 1} of {transactions.length}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={tx.id}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 50 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -50 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Transaction details */}
            <div className="rounded-lg border p-4 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-medium truncate">
                  {tx.counterparty_name || "Unknown"}
                </span>
                <Badge
                  variant={tx.credit_debit === "CRDT" ? "default" : "secondary"}
                >
                  {formatAmount(tx)}
                </Badge>
              </div>
              {tx.remittance_info && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tx.remittance_info}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {tx.booking_date ?? "No date"}
              </p>
            </div>

            {/* Explanation input */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Explain</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="What is this transaction for?"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !submitting) handleSubmit();
                  }}
                  data-testid="clarify-explanation"
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || !explanation.trim()}
                  data-testid="clarify-submit"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Manual tagging */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Or tag manually</h3>
              <TagSelector
                transactionId={tx.id}
                assignedTags={txTags}
                allTags={tags}
                onAssign={onAssignTag}
                onRemove={onRemoveTag}
                onDelete={onDeleteTag}
                onCreate={onCreateTag}
                getTagCount={getTagCount}
                onTagsChanged={handleTagsChanged}
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between pt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            data-testid="clarify-prev"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          {index >= transactions.length - 1 && txTags.length > 0 ? (
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid="clarify-finished"
            >
              <Check className="h-4 w-4" /> Finished
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(index + 1)}
              disabled={index >= transactions.length - 1}
              data-testid="clarify-next"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
