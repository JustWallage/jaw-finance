import { useCallback, useEffect, useState } from "react";
import type { DBTag } from "../../db/types";

function authHeaders(): HeadersInit {
  const email = import.meta.env.VITE_DEV_USER_EMAIL;
  return email ? { "Cf-Access-Authenticated-User-Email": email } : {};
}

export function useTags() {
  const [tags, setTags] = useState<DBTag[]>([]);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags", { headers: authHeaders() });
    if (!res.ok) return;
    const data = (await res.json()) as { tags: DBTag[] };
    setTags(data.tags);
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  async function createTag(name: string, path: string): Promise<DBTag | null> {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, path }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag: DBTag };
    await fetchTags();
    return data.tag;
  }

  async function deleteTag(tagId: number): Promise<boolean> {
    const res = await fetch(`/api/tags/${tagId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) return false;
    await fetchTags();
    return true;
  }

  async function getTagCount(tagId: number): Promise<number> {
    const res = await fetch(`/api/tags/${tagId}/count`, {
      headers: authHeaders(),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { count: number };
    return data.count;
  }

  async function getTransactionTags(txId: number): Promise<DBTag[]> {
    const res = await fetch(`/api/transactions/${txId}/tags`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tags: DBTag[] };
    return data.tags;
  }

  async function assignTag(txId: number, tagId: number): Promise<boolean> {
    const res = await fetch(`/api/transactions/${txId}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ tag_id: tagId }),
    });
    return res.ok;
  }

  async function removeTag(txId: number, tagId: number): Promise<boolean> {
    const res = await fetch(`/api/transactions/${txId}/tags/${tagId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  }

  return {
    tags,
    fetchTags,
    createTag,
    deleteTag,
    getTagCount,
    getTransactionTags,
    assignTag,
    removeTag,
  };
}
