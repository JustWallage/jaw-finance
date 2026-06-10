import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

export function useAmbiguousCount(selectedAccountUid: string) {
  const [ambiguousCount, setAmbiguousCount] = useState(0);
  const requestSeq = useRef(0);

  const fetchAmbiguousCount = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const params = selectedAccountUid
        ? `?account_uid=${selectedAccountUid}`
        : "";
      const data = await apiFetch<{ count: number }>(
        `/api/transactions/ambiguous-count${params}`,
      );
      // Concurrent refetches resolve out of order; only the latest may win
      if (seq === requestSeq.current) setAmbiguousCount(data.count);
    } catch {
      /* non-critical */
    }
  }, [selectedAccountUid]);

  useEffect(() => {
    fetchAmbiguousCount();
  }, [fetchAmbiguousCount]);

  return { ambiguousCount, fetchAmbiguousCount };
}
