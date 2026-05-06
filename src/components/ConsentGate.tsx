import { useEffect, useState } from "react";
import { authHeaders } from "../lib/auth-headers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "needed" | "granted">(
    "loading",
  );

  useEffect(() => {
    fetch("/api/consent", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const data = d as { consented: boolean };
        setStatus(data.consented ? "granted" : "needed");
      })
      .catch(() => setStatus("needed"));
  }, []);

  const accept = async () => {
    await fetch("/api/consent", { method: "POST", headers: authHeaders() });
    setStatus("granted");
  };

  if (status === "loading") return null;
  if (status === "granted") return <>{children}</>;

  return (
    <>
      {children}
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          data-testid="consent-modal"
        >
          <DialogHeader>
            <DialogTitle>Terms & Conditions and Data Privacy</DialogTitle>
            <DialogDescription>
              To use jaw-finance, you must agree to our Terms &amp; Conditions
              and Data Privacy Policy.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 text-sm">
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
                data-testid="link-terms"
              >
                Terms &amp; Conditions
              </a>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
                data-testid="link-privacy"
              >
                Data Privacy Policy
              </a>
            </div>
            <Button onClick={accept} data-testid="accept-consent">
              I Accept and Consent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
