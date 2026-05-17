import { NavLink, Outlet } from "react-router-dom";
import { Home, MessageCircle, TrendingUp, Settings, Eye, EyeOff } from "lucide-react";
import { useBankConnectionContext } from "./BankConnectionProvider";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Layout() {
  const { connections, selectedAccountUid, setSelectedAccountUid } = useBankConnectionContext();
  const [hideIncome, setHideIncome] = useLocalStorage("jaw-finance-hide-income", false);

  const accountLabel = (uid: string) => {
    if (uid === "all") return "All Accounts";
    const c = connections.find((conn) => conn.account_uid === uid);
    return c?.nickname ?? c?.iban ?? uid;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background p-4 pb-24 pt-0 text-foreground sm:p-8 sm:pb-24 sm:pt-0">
      <header className="sticky top-0 z-40 -mx-4 mb-6 flex w-[calc(100%+2rem)] items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:w-[calc(100%+4rem)] sm:px-8">
        <h1 className="text-lg font-bold tracking-tight">JAW Finance</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideIncome(!hideIncome)}
            data-testid="toggle-income"
            title={hideIncome ? "Show income" : "Hide income"}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {hideIncome ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {connections.length > 0 && (
            <Select value={selectedAccountUid} onValueChange={(v) => { if (v) setSelectedAccountUid(v); }}>
              <SelectTrigger
                className="h-8 w-auto gap-1.5 rounded-full border-border bg-secondary px-3 text-xs font-medium"
                data-testid="account-switcher"
              >
                <SelectValue>{accountLabel(selectedAccountUid)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="account-option-all">All Accounts</SelectItem>
                {connections.map((c) => (
                  <SelectItem key={c.account_uid} value={c.account_uid} data-testid={`account-option-${c.account_uid}`}>
                    {c.nickname ?? c.iban ?? c.account_uid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>
      <div className="w-full max-w-2xl space-y-6">
        <Outlet context={{ hideIncome }} />
      </div>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const items = [
    { to: "/", label: "Home", icon: Home, testId: "nav-home" },
    { to: "/chat", label: "Chat", icon: MessageCircle, testId: "nav-chat" },
    { to: "/trends", label: "Trends", icon: TrendingUp, testId: "nav-trends" },
    { to: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur"
      data-testid="bottom-nav"
    >
      <div className="mx-auto flex max-w-md justify-around p-2">
        {items.map(({ to, label, icon: Icon, testId }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={testId}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-md px-4 py-2 text-xs transition-colors ${
                isActive
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
