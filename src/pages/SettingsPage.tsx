import { useState } from "react";
import { Loader2, Link as LinkIcon, AlertTriangle, History, Pencil, User, Database } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBankConnectionContext } from "../components/BankConnectionProvider";
import { authHeaders } from "../lib/auth-headers";

export default function SettingsPage() {
  const {
    connections,
    loading,
    error,
    activeConnection,
    expiringSoon,
    importProgress,
    userEmail,
    handleConnect,
    handleRefresh,
    handleImportHistory,
    fetchStatus,
  } = useBankConnectionContext();

  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankList, setBankList] = useState<{ name: string; country: string; logo: string }[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);

  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState<Record<string, string>>({});
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameSaveError, setNicknameSaveError] = useState<string | null>(null);

  const [merchantPendingLoading, setMerchantPendingLoading] = useState(false);
  const [merchantForceLoading, setMerchantForceLoading] = useState(false);
  const [merchantResult, setMerchantResult] = useState<string | null>(null);

  async function handleMerchantPending() {
    setMerchantPendingLoading(true);
    setMerchantResult(null);
    try {
      const res = await fetch("/api/transactions/evaluate-merchant-pending", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json() as { evaluated: number };
      setMerchantResult(`Evaluated ${data.evaluated} pending transactions`);
    } catch {
      setMerchantResult("Failed to evaluate");
    } finally {
      setMerchantPendingLoading(false);
    }
  }

  async function handleMerchantForce() {
    setMerchantForceLoading(true);
    setMerchantResult(null);
    try {
      const res = await fetch("/api/transactions/evaluate-merchant-all-force", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json() as { evaluated: number };
      setMerchantResult(`Re-evaluated ${data.evaluated} transactions`);
    } catch {
      setMerchantResult("Failed to evaluate");
    } finally {
      setMerchantForceLoading(false);
    }
  }

  async function openBankDialog() {
    setBankDialogOpen(true);
    setBankSearch("");
    if (bankList.length > 0) return;
    setBankLoading(true);
    try {
      const res = await fetch("/api/bank/aspsps", { headers: authHeaders() });
      if (res.ok) {
        const data = (await res.json()) as { aspsps: { name: string; country: string; logo: string }[] };
        setBankList(data.aspsps.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } finally {
      setBankLoading(false);
    }
  }

  function selectBank(aspsp: { name: string; country: string }) {
    setBankDialogOpen(false);
    handleConnect(aspsp);
  }

  const filteredBanks = bankList.filter(
    (b) =>
      b.name.toLowerCase().includes(bankSearch.toLowerCase()) ||
      b.country.toLowerCase().includes(bankSearch.toLowerCase()),
  );
  const hasExpiredConnection = connections.length > 0 && !activeConnection;

  function openNicknameDialog() {
    const draft: Record<string, string> = {};
    for (const c of connections) draft[c.account_uid] = c.nickname ?? "";
    setNicknameDraft(draft);
    setNicknameSaveError(null);
    setNicknameDialogOpen(true);
  }

  async function saveNicknames() {
    setNicknameSaving(true);
    setNicknameSaveError(null);
    try {
      const res = await fetch("/api/bank/nickname", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ nicknames: nicknameDraft }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setNicknameSaveError(data.error ?? "Failed to save");
        return;
      }
      try { await fetchStatus(); } catch (e) { console.warn("fetchStatus failed:", e); }
      setNicknameDialogOpen(false);
    } catch {
      setNicknameSaveError("Network error. Please try again.");
    } finally {
      setNicknameSaving(false);
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {error && (
        <Alert variant="destructive" data-testid="error-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{userEmail ?? "Not signed in"}</p>
          <div className="flex gap-2 text-xs">
            <a href="/terms" className="underline text-primary" data-testid="link-terms">Terms</a>
            <a href="/privacy" className="underline text-primary" data-testid="link-privacy">Privacy</a>
          </div>
        </CardContent>
      </Card>

      {/* Bank Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Bank Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {activeConnection ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                Connected to {activeConnection.aspsp_name}
                <Badge variant="secondary" className="ml-2">{activeConnection.aspsp_country}</Badge>
              </p>
              {activeConnection.iban && <p>IBAN: {activeConnection.iban}</p>}
              <p>Valid until: {new Date(activeConnection.valid_until).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bank connected.</p>
          )}

          {importProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="import-progress">
              <Loader2 className="h-4 w-4 animate-spin" />
              {importProgress}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!activeConnection ? (
              <Button
                variant={hasExpiredConnection ? "destructive" : "default"}
                onClick={openBankDialog}
                disabled={loading !== null}
                data-testid={hasExpiredConnection ? "reconnect-button" : "connect-button"}
              >
                {loading === "connect" ? (
                  <><Loader2 className="animate-spin" /> Connecting…</>
                ) : (
                  hasExpiredConnection ? <><LinkIcon className="h-4 w-4" /> Reconnect</> : <><LinkIcon className="h-4 w-4" /> Connect Bank</>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => { handleRefresh(); }}
                  disabled={loading !== null || importProgress !== null}
                  data-testid="refresh-button"
                >
                  {loading === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={openBankDialog}
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
                    <DropdownMenuItem data-testid="import-3m" onClick={() => handleImportHistory(3)}>3 Months</DropdownMenuItem>
                    <DropdownMenuItem data-testid="import-1y" onClick={() => handleImportHistory(12)}>1 Year</DropdownMenuItem>
                    <DropdownMenuItem data-testid="import-5y" onClick={() => handleImportHistory(60)}>5 Years</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Nicknames */}
      {connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Account Names
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {connections.map((c) => (
                <div key={c.account_uid} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.iban ?? c.account_uid}</span>
                  <span className="font-medium">{c.nickname || "—"}</span>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={openNicknameDialog} data-testid="edit-nicknames-button">
                <Pencil className="h-3 w-3" /> Edit Names
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merchant Dictionary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Merchant Dictionary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Auto-tag transactions by matching merchant names against the global pattern dictionary.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleMerchantPending}
              disabled={merchantPendingLoading || merchantForceLoading}
              data-testid="merchant-evaluate-pending"
            >
              {merchantPendingLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Evaluate Pending
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleMerchantForce}
              disabled={merchantPendingLoading || merchantForceLoading}
              data-testid="merchant-evaluate-force"
            >
              {merchantForceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Re-evaluate All
            </Button>
          </div>
          {merchantResult && (
            <p className="text-sm text-muted-foreground" data-testid="merchant-result">{merchantResult}</p>
          )}
        </CardContent>
      </Card>

      {/* Bank Selection Dialog */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select your bank</DialogTitle>
            <DialogDescription>Search and select the bank you want to connect.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search banks…"
            value={bankSearch}
            onChange={(e) => setBankSearch(e.target.value)}
            autoFocus
            data-testid="bank-search-input"
          />
          <div className="overflow-y-auto flex-1 min-h-0 max-h-[50vh]">
            {bankLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredBanks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No banks found.</p>
            ) : (
              <div className="space-y-1">
                {filteredBanks.map((bank) => (
                  <button
                    key={`${bank.country}-${bank.name}`}
                    className="w-full flex items-center gap-3 p-2 rounded hover:bg-accent text-left"
                    onClick={() => selectBank({ name: bank.name, country: bank.country })}
                    data-testid={`bank-option-${bank.name}`}
                  >
                    <img src={`${bank.logo}-/resize/32x/`} alt="" className="w-6 h-6 rounded" loading="lazy" />
                    <span className="flex-1 text-sm font-medium">{bank.name}</span>
                    <Badge variant="outline" className="text-xs">{bank.country}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nickname Dialog */}
      <Dialog open={nicknameDialogOpen} onOpenChange={setNicknameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account names</DialogTitle>
            <DialogDescription>Set a nickname for each account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c.account_uid} className="space-y-1">
                <p className="text-xs text-muted-foreground">{c.iban ?? c.account_uid}</p>
                <Input
                  placeholder={c.iban ?? c.account_uid}
                  value={nicknameDraft[c.account_uid] ?? ""}
                  onChange={(e) => setNicknameDraft((prev) => ({ ...prev, [c.account_uid]: e.target.value }))}
                  data-testid={`nickname-input-${c.account_uid}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {nicknameSaveError && <p className="flex-1 text-sm text-destructive">{nicknameSaveError}</p>}
            <Button variant="outline" onClick={() => setNicknameDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveNicknames} disabled={nicknameSaving} data-testid="save-nicknames-button">
              {nicknameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
