import { useCallback, useEffect, useState } from "react";
import type { DBTag, TagStatus } from "../../db/types";
import { apiFetch } from "../lib/api";

async function fetchTagsByStatus(status?: TagStatus): Promise<DBTag[]> {
  const url = status ? `/api/tags?status=${status}` : "/api/tags";
  try {
    const data = await apiFetch<{ tags: DBTag[] }>(url);
    return data.tags;
  } catch {
    return [];
  }
}

function isUserDomainTag(t: DBTag): boolean {
  return t.source !== "system";
}

export function useTagManagement() {
  const [tags, setTags] = useState<DBTag[]>([]);
  const [rejected, setRejected] = useState<DBTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [all, rej] = await Promise.all([
      fetchTagsByStatus(),
      fetchTagsByStatus("rejected"),
    ]);
    setTags(all.filter(isUserDomainTag));
    setRejected(rej.filter(isUserDomainTag));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tags, rejected, loading, refresh };
}
