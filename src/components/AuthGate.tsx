import { useEffect, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (
          r.ok &&
          r.headers.get("content-type")?.includes("application/json")
        ) {
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  if (status === "loading") return null;
  if (status === "unauthenticated") {
    window.location.href = "/api/auth/login";
    return null;
  }

  return <>{children}</>;
}
