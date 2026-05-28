import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  count: number;
  onClick: () => void;
}

export function AmbiguousBanner({ count, onClick }: Props) {
  if (count === 0) return null;

  return (
    <Alert
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
      data-testid="ambiguous-banner"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        You have <strong>{count}</strong> ambiguous transaction
        {count !== 1 ? "s" : ""}. Tap to clarify.
      </AlertDescription>
    </Alert>
  );
}
