import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function usePendingCount() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const fetchPendingCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ count: number }>(
        "/api/transactions/pending-count",
      );
      setPendingCount(data.count);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  return { pendingCount, fetchPendingCount };
}
