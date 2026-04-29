import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import { assignTagConsolidated } from "../../../lib/tag-utils";
import type { DBTag, DBTransaction } from "../../../../db/types";
import { exampleTagList, MAX_NEW_TAGS, SYSTEM_PROMPT } from "./prompt";

interface AIResponse {
  reasoning?: string;
  tags?: string[];
}

interface ParsedAIResponse {
  reasoning: string | null;
  tags: string[];
}

interface HistoricalFrequency {
  path: string;
  percentage: number;
}

function isReservedAutoPath(p: string): boolean {
  return (
    p === "income" ||
    p === "expense" ||
    /^year-\d{4}(\/|$)/.test(p) ||
    /^month-\d{4}-\d{2}(\/|$)/.test(p) ||
    /^day-\d{4}-\d{2}-\d{2}(\/|$)/.test(p)
  );
}

/** Format a tag with optional reasoning into a single string for the prompt:
 *   "path"            (no reasoning)
 *   "path (reasoning)" (with reasoning) */
function formatTagForPrompt(path: string, reasoning: string | null): string {
  return reasoning ? `${path} (${reasoning})` : path;
}

/** Query D1 for tag frequency distribution across transactions matching a field value.
 *  Returns tags appearing in strictly more than 10% of matching transactions.
 *  `field` is validated against a known-safe whitelist before interpolation. */
async function fetchHistoricalTagFrequencies(
  db: D1Database,
  field: "remittance_info" | "counterparty_name",
  value: string,
  excludeTransactionId: number,
  userEmail: string,
): Promise<HistoricalFrequency[]> {
  const ALLOWED_FIELDS = new Set(["remittance_info", "counterparty_name"]);
  if (!ALLOWED_FIELDS.has(field)) return [];
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM transactions WHERE ${field} = ? AND user_email = ? AND id != ?`,
    )
    .bind(value, userEmail, excludeTransactionId)
    .first<{ cnt: number }>();

  const total = totalRow?.cnt ?? 0;
  if (total === 0) return [];

  const tagRows = await db
    .prepare(
      `SELECT t.path, COUNT(*) as cnt
       FROM transaction_tags tt
       JOIN tags t ON t.id = tt.tag_id
       JOIN transactions tr ON tr.id = tt.transaction_id
       WHERE tr.${field} = ? AND tr.user_email = ? AND tt.transaction_id != ?
         AND t.source != 'system' AND t.status != 'rejected'
       GROUP BY t.path`,
    )
    .bind(value, userEmail, excludeTransactionId)
    .all<{ path: string; cnt: number }>();

  return tagRows.results
    .map((r) => ({ path: r.path, percentage: Math.round((r.cnt / total) * 100) }))
    .filter((r) => r.percentage > 10)
    .sort((a, b) => b.percentage - a.percentage);
}

function buildPrompt(
  tx: DBTransaction,
  alreadyAssigned: string[],
  existingFormatted: string[],
  rejected: string[],
  descriptionFrequencies: HistoricalFrequency[],
  counterpartyFrequencies: HistoricalFrequency[] | null, // null = counterparty section omitted
): string {
  const exampleFormatted = exampleTagList.map((e) =>
    formatTagForPrompt(e.path, e.reasoning),
  );
  const existingPlusExamples = [...existingFormatted, ...exampleFormatted];

  const descriptionBlock =
    descriptionFrequencies.length > 0
      ? descriptionFrequencies.map((f) => `${f.path} (${f.percentage}%)`).join("\n")
      : "None";

  let historicalSection = `Tags of previous transactions with the exact same description:\n${descriptionBlock}`;
  if (counterpartyFrequencies !== null) {
    const counterpartyBlock =
      counterpartyFrequencies.length > 0
        ? counterpartyFrequencies.map((f) => `${f.path} (${f.percentage}%)`).join("\n")
        : "None";
    historicalSection += `\n\nTags of previous transactions with the exact same counterparty name:\n${counterpartyBlock}`;
  }

  return `Transaction:
- Date: ${tx.booking_date ?? "unknown"}
- Amount: ${tx.credit_debit === "CRDT" ? "+" : "-"}${tx.amount} ${tx.currency} (${tx.credit_debit === "CRDT" ? "income" : "expense"})
- Counterparty: ${tx.counterparty_name ?? "unknown"}
- Description: ${tx.remittance_info ?? "(none)"}

${historicalSection}

ALREADY on this transaction (do not re-suggest these or their parents): ${JSON.stringify(alreadyAssigned)}
EXISTING tags you may reuse — format "path (reasoning)" or "path": ${JSON.stringify(existingPlusExamples)}
REJECTED (NEVER suggest): ${JSON.stringify(rejected)}

Respond with JSON only.`;
}

function sanitizePath(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .replace(/[^a-z0-9/_-]/g, "-");
  if (!cleaned) return null;
  if (isReservedAutoPath(cleaned)) return null;
  return cleaned;
}

/** Parse model output. Model may wrap JSON in prose; extract first {...}. */
function parseAIResponse(raw: string): ParsedAIResponse {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { reasoning: null, tags: [] };
  try {
    const parsed = JSON.parse(match[0]) as AIResponse;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string")
      : [];
    const reasoning =
      typeof parsed.reasoning === "string" && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : null;
    return { reasoning, tags };
  } catch {
    return { reasoning: null, tags: [] };
  }
}

/** Mock branch for non-production E2E. Returns a deterministic mix of an
 *  existing tag (if any non-system one exists) and a new nested path. */
function mockResponse(existing: string[]): ParsedAIResponse {
  const reuse = existing.find((p) => !isReservedAutoPath(p));
  return {
    reasoning: "Deterministic mock reasoning for E2E tests.",
    tags: reuse
      ? [reuse, "ai-mock/new-parent/new-leaf"]
      : ["ai-mock/existing-fallback", "ai-mock/new-parent/new-leaf"],
  };
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const txId = Number((context.params as { id: string }).id);

    const tx = await env.DB.prepare(
      "SELECT * FROM transactions WHERE id = ? AND user_email = ?",
    )
      .bind(txId, userEmail)
      .first<DBTransaction>();

    if (!tx) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    const allTags = await env.DB.prepare(
      "SELECT * FROM tags WHERE user_email = ?",
    )
      .bind(userEmail)
      .all<DBTag>();

    // EXISTING = confirmed + unconfirmed user-domain tags (LLM may reuse either).
    const existingTags = allTags.results.filter(
      (t) =>
        (t.status === "confirmed" || t.status === "unconfirmed") &&
        !isReservedAutoPath(t.path),
    );
    const existing = existingTags.map((t) => t.path);
    const existingFormatted = existingTags.map((t) =>
      formatTagForPrompt(t.path, t.reasoning),
    );
    const rejected = allTags.results
      .filter((t) => t.status === "rejected")
      .map((t) => t.path);

    // Tags already on this transaction (excl. system auto-tags).
    const alreadyRows = await env.DB.prepare(
      `SELECT t.path FROM tags t
       JOIN transaction_tags tt ON tt.tag_id = t.id
       WHERE tt.transaction_id = ? AND t.user_email = ?`,
    )
      .bind(txId, userEmail)
      .all<{ path: string }>();
    const alreadyAssigned = alreadyRows.results
      .map((r) => r.path)
      .filter((p) => !isReservedAutoPath(p));

    // Historical RAG: tag frequency across past transactions with same description/counterparty.
    const descriptionFrequencies = tx.remittance_info
      ? await fetchHistoricalTagFrequencies(
          env.DB,
          "remittance_info",
          tx.remittance_info,
          txId,
          userEmail,
        )
      : [];
    const counterpartyFrequencies =
      tx.counterparty_name?.trim()
        ? await fetchHistoricalTagFrequencies(
            env.DB,
            "counterparty_name",
            tx.counterparty_name,
            txId,
            userEmail,
          )
        : null;

    const userMessage = buildPrompt(
      tx,
      alreadyAssigned,
      existingFormatted,
      rejected,
      descriptionFrequencies,
      counterpartyFrequencies,
    );

    // Mock branch for non-production E2E. Production NEVER honours the header.
    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let parsed: ParsedAIResponse;
    if (useMock) {
      parsed = mockResponse(existing);
    } else {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ];
      const aiResp = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages,
        max_tokens: 300,
      });
      const text =
        typeof (aiResp as { response?: string }).response === "string"
          ? (aiResp as { response: string }).response
          : JSON.stringify(aiResp);
      console.log(
        `Input:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n\n")}\nAI output:\n${text}`,
      );
      parsed = parseAIResponse(text);
    }

    const rejectedSet = new Set(rejected);
    const existingSet = new Set(existing);
    const alreadySet = new Set(alreadyAssigned);

    // Stage 1: sanitize + drop rejected/banned/reserved.
    const sanitized: string[] = [];
    for (const raw of parsed.tags) {
      const path = sanitizePath(raw);
      if (!path) continue;
      const segs = path.split("/");
      let banned = false;
      for (let i = 1; i <= segs.length; i++) {
        if (rejectedSet.has(segs.slice(0, i).join("/"))) {
          banned = true;
          break;
        }
      }
      if (!banned) sanitized.push(path);
    }

    // Stage 2: drop a path if any OTHER (deeper) sanitized path or any
    // already-assigned path has it as a strict prefix.
    const allDeeper = new Set([...sanitized, ...alreadyAssigned]);
    const deduped = sanitized.filter((p) => {
      for (const other of allDeeper) {
        if (other !== p && other.startsWith(p + "/")) return false;
      }
      return true;
    });

    // Stage 3: drop exact duplicates of already-assigned.
    const remaining = deduped.filter((p) => !alreadySet.has(p));

    // Stage 4: cap NEW (not in existingSet) at MAX_NEW_TAGS. Reuses unlimited.
    const accepted: string[] = [];
    let newCount = 0;
    for (const p of remaining) {
      if (existingSet.has(p)) {
        accepted.push(p);
      } else if (newCount < MAX_NEW_TAGS) {
        accepted.push(p);
        newCount++;
      }
    }

    // Assign. For NEW leaves, propagate the LLM's root reasoning to the leaf
    // segment only; ancestors get reasoning=null. Reused tags pass null
    // (ON CONFLICT preserves their existing reasoning).
    const assignedPaths: string[] = [];
    for (const path of accepted) {
      const isNew = !existingSet.has(path);
      await assignTagConsolidated(
        env.DB,
        txId,
        userEmail,
        path,
        isNew ? "llm" : "user",
        isNew ? "unconfirmed" : "confirmed",
        isNew ? parsed.reasoning : null,
      );
      assignedPaths.push(path);
    }

    return Response.json({
      assigned: assignedPaths,
      reasoning: parsed.reasoning,
      ...(useMock && context.request.headers.get("X-Test-Return-Prompt") === "1"
        ? { prompt: userMessage }
        : {}),
    });
  } catch (err) {
    console.error("[evaluate] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
