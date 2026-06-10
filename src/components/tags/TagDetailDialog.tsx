import { useEffect, useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import type { DBTag, DBTransaction, TagStatus } from "../../../db/types";
import { apiFetch } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

async function fetchTagTransactions(tagId: number): Promise<DBTransaction[]> {
  try {
    const data = await apiFetch<{ transactions: DBTransaction[] }>(
      `/api/tags/${tagId}/transactions`,
    );
    return data.transactions;
  } catch {
    return [];
  }
}

function patchTag(
  tagId: number,
  body: { new_name?: string; status?: TagStatus },
) {
  return apiFetch(`/api/tags/${tagId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function TagDetailDialog({
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

  async function applyPatch(body: { new_name?: string; status?: TagStatus }) {
    if (!tag) return;
    setBusy(true);
    setError(null);
    try {
      await patchTag(tag.id, body);
      setBusy(false);
      await onChanged();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed");
    }
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
              onClick={() => applyPatch({ new_name: newName.trim() })}
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
                onClick={() => applyPatch({ status: "confirmed" })}
                disabled={busy}
                data-testid="tag-confirm-button"
              >
                <Check className="h-3 w-3" /> Confirm
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => applyPatch({ status: "rejected" })}
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
