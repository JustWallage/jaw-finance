import { useCallback, useEffect, useState } from "react";
import { Check, X, Pencil, Loader2 } from "lucide-react";
import type { DBTag, DBTransaction } from "../../db/types";
import { authHeaders } from "../lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type TagStatus = "confirmed" | "unconfirmed" | "rejected";

async function fetchTags(status?: TagStatus): Promise<DBTag[]> {
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

/** Hide system-created auto tags (income/expense, year-/month-/day-) from the page. */
function isUserDomainTag(t: DBTag): boolean {
  return t.source !== "system";
}

export default function TagsPage() {
  const [tags, setTags] = useState<DBTag[]>([]);
  const [rejected, setRejected] = useState<DBTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<DBTag | null>(null);

  const refresh = useCallback(async () => {
    const [all, rej] = await Promise.all([
      fetchTags(),
      fetchTags("rejected"),
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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm" data-testid="view-rejected-button">
                View Rejected Tags ({rejected.length})
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
                <p className="text-sm text-muted-foreground">No rejected tags.</p>
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

      {loading && (
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

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
    </>
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
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
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
                <Check className="h-3 w-3" />
                Confirm
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={busy}
              data-testid="tag-reject-button"
            >
              <X className="h-3 w-3" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={busy}
              data-testid="tag-edit-button"
            >
              <Pencil className="h-3 w-3" />
              Edit name
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
                    tx.credit_debit === "CRDT"
                      ? "text-green-500"
                      : "text-red-500"
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
