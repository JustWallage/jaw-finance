import { useCallback, useEffect, useState } from "react";
import type { DBTag } from "../../db/types";
import { apiFetch } from "../lib/api";

export function useTags() {
  const [tags, setTags] = useState<DBTag[]>([]);

  const fetchTags = useCallback(async () => {
    try {
      const data = await apiFetch<{ tags: DBTag[] }>("/api/tags");
      setTags(data.tags);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  async function createTag(name: string, path: string): Promise<DBTag | null> {
    try {
      const data = await apiFetch<{ tag: DBTag }>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path }),
      });
      await fetchTags();
      return data.tag;
    } catch {
      return null;
    }
  }

  async function deleteTag(tagId: number): Promise<boolean> {
    try {
      await apiFetch(`/api/tags/${tagId}`, { method: "DELETE" });
      await fetchTags();
      return true;
    } catch {
      return false;
    }
  }

  async function getTagCount(tagId: number): Promise<number> {
    try {
      const data = await apiFetch<{ count: number }>(
        `/api/tags/${tagId}/count`,
      );
      return data.count;
    } catch {
      return 0;
    }
  }

  async function getTransactionTags(txId: number): Promise<DBTag[]> {
    try {
      const data = await apiFetch<{ tags: DBTag[] }>(
        `/api/transactions/${txId}/tags`,
      );
      return data.tags;
    } catch {
      return [];
    }
  }

  async function assignTag(txId: number, tagId: number): Promise<boolean> {
    try {
      await apiFetch(`/api/transactions/${txId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function removeTag(txId: number, tagId: number): Promise<boolean> {
    try {
      await apiFetch(`/api/transactions/${txId}/tags/${tagId}`, {
        method: "DELETE",
      });
      return true;
    } catch {
      return false;
    }
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
