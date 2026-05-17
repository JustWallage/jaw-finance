import { useState, useRef, useEffect } from "react";
import { authHeaders } from "../lib/auth-headers";
import type { DBTransaction } from "../../db/types";

export interface ChatResult {
  summary: string;
  transactions: DBTransaction[];
  totalIncome: number;
  totalExpense: number;
  byPath: {
    path: string;
    totalIncome: number;
    totalExpense: number;
    count: number;
  }[];
}

export function useChat() {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<ChatResult | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [thinkingDots, setThinkingDots] = useState(1);

  useEffect(() => {
    if (!chatLoading) return;
    setThinkingDots(1);
    const interval = setInterval(
      () => setThinkingDots((d) => (d % 3) + 1),
      500,
    );
    return () => clearInterval(interval);
  }, [chatLoading]);

  async function handleChatSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatQuestion.trim() || chatLoading) return;
    setChatLoading(true);
    setChatResult(null);
    setChatExpanded(false);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
          "X-Test-Mock-AI": import.meta.env.VITE_MOCK_AI === "1" ? "1" : "",
        },
        body: JSON.stringify({ question: chatQuestion.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        summary: string;
        transactions: DBTransaction[];
        totalIncome: number;
        totalExpense: number;
        byPath?: {
          path: string;
          totalIncome: number;
          totalExpense: number;
          count: number;
        }[];
      };
      if (data.error) throw new Error(data.error);
      setChatResult({ ...data, byPath: data.byPath ?? [] });
    } catch {
      setChatResult({
        summary: "Something went wrong. Please try again.",
        transactions: [],
        totalIncome: 0,
        totalExpense: 0,
        byPath: [],
      });
    } finally {
      setChatLoading(false);
    }
  }

  return {
    chatQuestion,
    setChatQuestion,
    chatLoading,
    chatResult,
    setChatResult,
    chatExpanded,
    setChatExpanded,
    chatInputRef,
    thinkingDots,
    handleChatSubmit,
  };
}
