import { NavLink, Outlet } from "react-router-dom";
import { Home, Tag } from "lucide-react";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background p-8 pb-24 text-foreground dark">
      <div className="w-full max-w-4xl space-y-6">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const items = [
    { to: "/", label: "Home", icon: Home, testId: "nav-home" },
    { to: "/tags", label: "Tags", icon: Tag, testId: "nav-tags" },
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
                  ? "text-foreground"
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
