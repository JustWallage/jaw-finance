import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import { assignTagConsolidated } from "../../../lib/tag-utils";
import type { DBTag, DBTransaction } from "../../../../db/types";

interface AIResponse {
  tags: string[];
}

const MAX_NEW_TAGS = 5;

const SYSTEM_PROMPT = `You categorize bank transactions with hierarchical Materialized Path tags (e.g. "food/groceries", "vacation/summer-2026/transport").

Core principle: QUALITY OVER QUANTITY. Most transactions need 0 to 2 tags. It is BETTER to return an empty list than to invent weak tags.

Rules:
1. Look at ALREADY tags first. If they already describe this transaction well, return {"tags": []}. Do NOT add a parent of any tag in ALREADY (e.g. if "food/delivery" is in ALREADY, do NOT suggest "food").
2. You may reuse any number of tags from EXISTING (a list of all confirmed and unconfirmed tags) if they fit precisely.
3. You may also invent NEW paths even when an EXISTING tag fits — just include both. Hard cap: at most ${MAX_NEW_TAGS} new paths total. You almost never need more than 1 or 2 new paths. Do NOT pad the list to reach the cap.
4. Use lowercase kebab-case segments separated by '/'. Always use the deepest specific path that fits — never suggest both a parent and its child.
5. NEVER suggest any tag in REJECTED, nor any of its ancestors or descendants.
6. NEVER suggest reserved auto tags: 'income', 'expense', or paths beginning with 'year-', 'month-', or 'day-'.

Respond with ONLY a JSON object: {"tags": ["path1", "path2"]}. No prose.`;

function isReservedAutoPath(p: string): boolean {
  return (
    p === "income" ||
    p === "expense" ||
    /^year-\d{4}(\/|$)/.test(p) ||
    /^month-\d{4}-\d{2}(\/|$)/.test(p) ||
    /^day-\d{4}-\d{2}-\d{2}(\/|$)/.test(p)
  );
}

function buildPrompt(
  tx: DBTransaction,
  alreadyAssigned: string[],
  existing: string[],
  rejected: string[],
): string {
  return `Transaction:
- Date: ${tx.booking_date ?? "unknown"}
- Amount: ${tx.amount} ${tx.currency} (${tx.credit_debit === "CRDT" ? "income" : "expense"})
- Counterparty: ${tx.counterparty_name ?? "unknown"}
- Description: ${tx.remittance_info ?? "(none)"}

ALREADY on this transaction (do not re-suggest these or their parents): ${JSON.stringify(alreadyAssigned)}
EXISTING tags you may reuse (any number): ${JSON.stringify(existing)}
REJECTED (NEVER suggest): ${JSON.stringify(rejected)}

Respond with JSON only. Empty list is a valid and often correct answer.`;
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

/** Parse model output: model may wrap JSON in prose; extract first {...}. */
function parseAIResponse(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as Partial<AIResponse>;
    if (!Array.isArray(parsed.tags)) return [];
    return parsed.tags.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

/** Mock branch for staging E2E tests. Returns a deterministic mix of an
 *  existing confirmed tag (if any non-system one exists) and a new one. */
function mockTags(confirmed: string[]): string[] {
  const existing = confirmed.find((p) => !isReservedAutoPath(p));
  return existing
    ? [existing, "ai-mock/new-suggestion"]
    : ["ai-mock/existing-fallback", "ai-mock/new-suggestion"];
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

    const confirmed = allTags.results
      .filter((t) => t.status === "confirmed" && !isReservedAutoPath(t.path))
      .map((t) => t.path);
    // EXISTING = confirmed + unconfirmed (both are reusable; the LLM may suggest either).
    const existing = allTags.results
      .filter(
        (t) =>
          (t.status === "confirmed" || t.status === "unconfirmed") &&
          !isReservedAutoPath(t.path),
      )
      .map((t) => t.path);
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

    // Mock branch for non-production E2E. Production NEVER honours the header.
    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let suggested: string[];
    if (useMock) {
      suggested = mockTags(confirmed);
    } else {
      const aiResp = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildPrompt(tx, alreadyAssigned, existing, rejected),
          },
        ],
        max_tokens: 200,
      });
      const text =
        typeof (aiResp as { response?: string }).response === "string"
          ? (aiResp as { response: string }).response
          : JSON.stringify(aiResp);
      suggested = parseAIResponse(text);
    }

    const rejectedSet = new Set(rejected);
    const existingSet = new Set(existing);
    const alreadySet = new Set(alreadyAssigned);

    // Stage 1: sanitize + drop rejected/banned/reserved.
    const sanitized: string[] = [];
    for (const raw of suggested) {
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
    // already-assigned path has it as a strict prefix. Prevents the model from
    // adding "food" when "food/delivery" is also suggested or already present.
    const allDeeper = new Set([...sanitized, ...alreadyAssigned]);
    const deduped = sanitized.filter((p) => {
      for (const other of allDeeper) {
        if (other !== p && other.startsWith(p + "/")) return false;
      }
      return true;
    });

    // Stage 3: drop exact duplicates of already-assigned (no-op work).
    const remaining = deduped.filter((p) => !alreadySet.has(p));

    // Stage 4: cap NEW (paths that don't already exist as confirmed or
    // unconfirmed) at MAX_NEW_TAGS. Reuses of existing tags are unlimited.
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
    // ON CONFLICT in ensureTagWithAncestors only updates `name`, so source/status
    // for existing rows are preserved. For NEW paths we mark as llm/unconfirmed.
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
      );
      assignedPaths.push(path);
    }

    return Response.json({ assigned: assignedPaths });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
