import { useState } from "react";
import {
  Loader2,
  Link as LinkIcon,
  AlertTriangle,
  History,
} from "lucide-react";
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
import { useBankConnectionContext } from "../BankConnectionProvider";
import { apiFetch } from "../../lib/api";

export function BankConnectionCard() {
  const {
    connections,
    loading,
    activeConnection,
    expiringSoon,
    importProgress,
    handleConnect,
    handleRefresh,
    handleImportHistory,
  } = useBankConnectionContext();

  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankList, setBankList] = useState<
    { name: string; country: string; logo: string }[]
  >([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);

  async function openBankDialog() {
    setBankDialogOpen(true);
    setBankSearch("");
    if (bankList.length > 0) return;
    setBankLoading(true);
    try {
      const data = await apiFetch<{
        aspsps: { name: string; country: string; logo: string }[];
      }>("/api/bank/aspsps");
      setBankList(data.aspsps.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      /* ignore */
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

  return (
    <>
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
                <Badge variant="secondary" className="ml-2">
                  {activeConnection.aspsp_country}
                </Badge>
              </p>
              {activeConnection.iban && <p>IBAN: {activeConnection.iban}</p>}
              <p>
                Valid until:{" "}
                {new Date(activeConnection.valid_until).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bank connected.</p>
          )}

          {importProgress && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="import-progress"
            >
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
                data-testid={
                  hasExpiredConnection ? "reconnect-button" : "connect-button"
                }
              >
                {loading === "connect" ? (
                  <>
                    <Loader2 className="animate-spin" /> Connecting…
                  </>
                ) : hasExpiredConnection ? (
                  <>
                    <LinkIcon className="h-4 w-4" /> Reconnect
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" /> Connect Bank
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleRefresh();
                  }}
                  disabled={loading !== null || importProgress !== null}
                  data-testid="refresh-button"
                >
                  {loading === "refresh" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
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
        </CardContent>
      </Card>

      {/* Bank Selection Dialog */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select your bank</DialogTitle>
            <DialogDescription>
              Search and select the bank you want to connect.
            </DialogDescription>
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
              <p className="text-sm text-muted-foreground text-center py-4">
                No banks found.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredBanks.map((bank) => (
                  <button
                    key={`${bank.country}-${bank.name}`}
                    className="w-full flex items-center gap-3 p-2 rounded hover:bg-accent text-left"
                    onClick={() =>
                      selectBank({ name: bank.name, country: bank.country })
                    }
                    data-testid={`bank-option-${bank.name}`}
                  >
                    <img
                      src={`${bank.logo}-/resize/32x/`}
                      alt=""
                      className="w-6 h-6 rounded"
                      loading="lazy"
                    />
                    <span className="flex-1 text-sm font-medium">
                      {bank.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {bank.country}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
