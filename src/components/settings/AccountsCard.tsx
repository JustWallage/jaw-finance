import { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBankConnectionContext } from "../BankConnectionProvider";
import { apiFetch } from "../../lib/api";

export function AccountsCard() {
  const { connections, fetchStatus } = useBankConnectionContext();

  const [accountDetailUid, setAccountDetailUid] = useState<string | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<
    {
      amount: string;
      currency: string;
      credit_debit: string;
      booking_date: string | null;
      counterparty_name: string | null;
      remittance_info: string | null;
    }[]
  >([]);
  const [accountDetailLoading, setAccountDetailLoading] = useState(false);
  const [accountNickname, setAccountNickname] = useState("");
  const [accountNicknameSaving, setAccountNicknameSaving] = useState(false);
  const [deleteConfirmUid, setDeleteConfirmUid] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const accountDetailConnection = connections.find(
    (c) => c.account_uid === accountDetailUid,
  );

  useEffect(() => {
    if (!accountDetailUid) return;
    setAccountDetailLoading(true);
    apiFetch<{ transactions: typeof accountTransactions }>(
      `/api/bank/transactions?account_uid=${encodeURIComponent(accountDetailUid)}`,
    )
      .then((data) => setAccountTransactions(data.transactions.slice(0, 5)))
      .catch(() => setAccountTransactions([]))
      .finally(() => setAccountDetailLoading(false));
  }, [accountDetailUid]);

  function openAccountDetail(uid: string) {
    const conn = connections.find((c) => c.account_uid === uid);
    setAccountNickname(conn?.nickname ?? "");
    setAccountDetailUid(uid);
  }

  async function saveAccountNickname() {
    if (!accountDetailUid) return;
    setAccountNicknameSaving(true);
    try {
      await apiFetch("/api/bank/nickname", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicknames: { [accountDetailUid]: accountNickname },
        }),
      });
      await fetchStatus();
    } finally {
      setAccountNicknameSaving(false);
    }
  }

  async function deleteAccount() {
    if (!deleteConfirmUid) return;
    setDeleteLoading(true);
    try {
      await apiFetch("/api/bank/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_uid: deleteConfirmUid }),
      });
      setDeleteConfirmUid(null);
      setAccountDetailUid(null);
      await fetchStatus();
    } finally {
      setDeleteLoading(false);
    }
  }

  if (connections.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Tap an account to rename or remove it
          </p>
          <div className="space-y-1">
            {connections.map((c) => (
              <button
                key={c.account_uid}
                onClick={() => openAccountDetail(c.account_uid)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                data-testid={`account-item-${c.account_uid}`}
              >
                <div className="text-left">
                  <p className="font-medium">
                    {c.nickname || c.iban || c.account_uid}
                  </p>
                  {c.nickname && c.iban && (
                    <p className="text-xs text-muted-foreground">{c.iban}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account Detail Modal */}
      <Dialog
        open={!!accountDetailUid}
        onOpenChange={(open) => {
          if (!open) setAccountDetailUid(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accountDetailConnection?.nickname ||
                accountDetailConnection?.iban ||
                accountDetailUid}
            </DialogTitle>
            <DialogDescription>
              {accountDetailConnection?.aspsp_name} ·{" "}
              {accountDetailConnection?.iban ?? accountDetailUid}
            </DialogDescription>
          </DialogHeader>

          {/* Rename */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Nickname</p>
            <div className="flex gap-2">
              <Input
                placeholder="Account nickname"
                value={accountNickname}
                onChange={(e) => setAccountNickname(e.target.value)}
                data-testid="account-detail-nickname"
              />
              <Button
                size="sm"
                onClick={saveAccountNickname}
                disabled={accountNicknameSaving}
                data-testid="account-detail-save-nickname"
              >
                {accountNicknameSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteConfirmUid(accountDetailUid)}
              data-testid="account-detail-delete"
            >
              <Trash2 className="h-3 w-3" /> Remove Account
            </Button>
          </div>

          {/* Recent Transactions */}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">Recent transactions</p>
            {accountDetailLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : accountTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions</p>
            ) : (
              <div className="space-y-1 text-sm">
                {accountTransactions.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded px-2 py-1 odd:bg-muted/50"
                  >
                    <div className="truncate flex-1">
                      <span className="text-muted-foreground">
                        {tx.booking_date ?? "—"}
                      </span>{" "}
                      {tx.counterparty_name || tx.remittance_info || "—"}
                    </div>
                    <span
                      className={
                        tx.credit_debit === "CRDT"
                          ? "text-green-600 font-medium ml-2"
                          : "text-foreground font-medium ml-2"
                      }
                    >
                      {tx.credit_debit === "CRDT" ? "+" : "-"}
                      {tx.amount} {tx.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirmUid}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmUid(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove account</DialogTitle>
            <DialogDescription>
              This will permanently delete this account and all its
              transactions. Tags will be kept. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmUid(null)}
              data-testid="delete-account-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAccount}
              disabled={deleteLoading}
              data-testid="delete-account-confirm"
            >
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-3 w-3" /> Delete
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
