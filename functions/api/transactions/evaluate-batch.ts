import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { assignTagConsolidated } from "../../lib/tag-utils";
import type { DBTag, DBTransaction } from "../../../db/types";
import { exampleTagList, MAX_NEW_TAGS, SYSTEM_PROMPT } from "./[id]/prompt";

const BATCH_SIZE = 50;

interface BatchAIItem {
  id: string;
  reasoning: string;
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

function formatTagForPrompt(path: string, reasoning: string | null): string {
  return reasoning ? `${path} (${reasoning})` : path;
}

async function fetchHistoricalTagFrequencies(
  db: D1Database,
  field: "remittance_info" | "counterparty_name",
  value: string,
  excludeTransactionIds: number[],
  userEmail: string,
): Promise<HistoricalFrequency[]> {
  const ALLOWED_FIELDS = new Set(["remittance_info", "counterparty_name"]);
  if (!ALLOWED_FIELDS.has(field)) return [];

  const placeholders = excludeTransactionIds.map(() => "?").join(", ");
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM transactions WHERE ${field} = ? AND user_email = ? AND id NOT IN (${placeholders})`,
    )
    .bind(value, userEmail, ...excludeTransactionIds)
    .first<{ cnt: number }>();

  const total = totalRow?.cnt ?? 0;
  if (total === 0) return [];

  const tagRows = await db
    .prepare(
      `SELECT t.path, COUNT(*) as cnt
       FROM transaction_tags tt
       JOIN tags t ON t.id = tt.tag_id
       JOIN transactions tr ON tr.id = tt.transaction_id
       WHERE tr.${field} = ? AND tr.user_email = ? AND tt.transaction_id NOT IN (${placeholders})
         AND t.source != 'system' AND t.status != 'rejected'
       GROUP BY t.path`,
    )
    .bind(value, userEmail, ...excludeTransactionIds)
    .all<{ path: string; cnt: number }>();

  return tagRows.results
    .map((r) => ({
      path: r.path,
      percentage: Math.round((r.cnt / total) * 100),
    }))
    .filter((r) => r.percentage > 10)
    .sort((a, b) => b.percentage - a.percentage);
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

function parseBatchAIResponse(raw: string): BatchAIItem[] {
  const stripped = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is BatchAIItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as BatchAIItem).id === "string" &&
        Array.isArray((item as BatchAIItem).tags),
    );
  } catch {
    return [];
  }
}

function mockBatchResponse(txs: DBTransaction[]): BatchAIItem[] {
  return txs.map((tx) => ({
    id: String(tx.id),
    reasoning: "Deterministic mock reasoning for E2E tests.",
    tags: ["ai-mock/new-parent/new-leaf"],
  }));
}

const BATCH_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are processing a BATCH of transactions. You must return a JSON ARRAY (not a single object).
Each element must follow this schema exactly: {"id": "<transaction_id>", "reasoning": "...", "tags": ["path1", "path2"]}.
If no tags apply to a transaction, return an empty tags array for it. Include every input transaction id in the output.
Output ONLY the JSON array, nothing else.`;

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);

    // Fetch up to BATCH_SIZE unevaluated transactions, newest first.
    const txRows = await env.DB.prepare(
      `SELECT * FROM transactions
       WHERE user_email = ? AND ai_evaluated = 0
       ORDER BY booking_date DESC, id DESC
       LIMIT ?`,
    )
      .bind(userEmail, BATCH_SIZE)
      .all<DBTransaction>();

    const txs = txRows.results;
    if (txs.length === 0) {
      return Response.json({ processed: 0, results: [] });
    }

    const txIds = txs.map((t) => t.id);

    // Fetch all user tags once.
    const allTags = await env.DB.prepare(
      "SELECT * FROM tags WHERE user_email = ?",
    )
      .bind(userEmail)
      .all<DBTag>();

    const existingTags = allTags.results.filter(
      (t) =>
        (t.status === "confirmed" || t.status === "unconfirmed") &&
        !isReservedAutoPath(t.path),
    );
    const existingSet = new Set(existingTags.map((t) => t.path));
    const existingFormatted = existingTags.map((t) =>
      formatTagForPrompt(t.path, t.reasoning),
    );
    const rejected = allTags.results
      .filter((t) => t.status === "rejected")
      .map((t) => t.path);
    const rejectedSet = new Set(rejected);

    const exampleFormatted = exampleTagList.map((e) =>
      formatTagForPrompt(e.path, e.reasoning),
    );
    const existingPlusExamples = [...existingFormatted, ...exampleFormatted];

    // Build per-transaction RAG context and already-assigned tags.
    const ragContexts: {
      desc: HistoricalFrequency[];
      counterparty: HistoricalFrequency[] | null;
    }[] = [];
    const alreadyPerTx: string[][] = [];

    for (const tx of txs) {
      const descFreqs = tx.remittance_info
        ? await fetchHistoricalTagFrequencies(
            env.DB,
            "remittance_info",
            tx.remittance_info,
            txIds,
            userEmail,
          )
        : [];
      const cpFreqs = tx.counterparty_name?.trim()
        ? await fetchHistoricalTagFrequencies(
            env.DB,
            "counterparty_name",
            tx.counterparty_name,
            txIds,
            userEmail,
          )
        : null;
      ragContexts.push({ desc: descFreqs, counterparty: cpFreqs });

      const alreadyRows = await env.DB.prepare(
        `SELECT t.path FROM tags t
         JOIN transaction_tags tt ON tt.tag_id = t.id
         WHERE tt.transaction_id = ? AND t.user_email = ?`,
      )
        .bind(tx.id, userEmail)
        .all<{ path: string }>();
      alreadyPerTx.push(
        alreadyRows.results
          .map((r) => r.path)
          .filter((p) => !isReservedAutoPath(p)),
      );
    }

    // Build the batch prompt payload (JSON array of transaction objects).
    const batchInput = txs.map((tx, i) => {
      const { desc, counterparty } = ragContexts[i];
      const already = alreadyPerTx[i];

      const descBlock =
        desc.length > 0
          ? desc.map((f) => `${f.path} (${f.percentage}%)`).join(", ")
          : "None";
      let ragStr = `desc_history: ${descBlock}`;
      if (counterparty !== null) {
        const cpBlock =
          counterparty.length > 0
            ? counterparty.map((f) => `${f.path} (${f.percentage}%)`).join(", ")
            : "None";
        ragStr += ` | counterparty_history: ${cpBlock}`;
      }

      return {
        id: String(tx.id),
        date: tx.booking_date ?? "unknown",
        amount: `${tx.credit_debit === "CRDT" ? "+" : "-"}${tx.amount} ${tx.currency}`,
        counterparty: tx.counterparty_name ?? "unknown",
        description: tx.remittance_info ?? "(none)",
        historical_tags: ragStr,
        already_assigned: already,
      };
    });

    const userMessage = `EXISTING tags you may reuse: ${JSON.stringify(existingPlusExamples)}
REJECTED (NEVER suggest): ${JSON.stringify(rejected)}

Transactions to evaluate:
${JSON.stringify(batchInput, null, 2)}

Respond with a JSON array only.`;

    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let batchItems: BatchAIItem[];
    if (useMock) {
      batchItems = mockBatchResponse(txs);
    } else {
      const aiResp = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" satisfies Parameters<
          typeof env.AI.run
        >[0],
        {
          messages: [
            { role: "system", content: BATCH_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
        },
      );
      const resp = (aiResp as { response?: unknown }).response;
      const choices = (
        aiResp as { choices?: { message?: { content?: string } }[] }
      ).choices;
      let text: string;
      if (Array.isArray(resp)) {
        text = JSON.stringify(resp);
      } else if (typeof resp === "string") {
        text = resp;
      } else if (typeof resp === "object" && resp !== null) {
        text = JSON.stringify(resp);
      } else if (typeof choices?.[0]?.message?.content === "string") {
        text = choices[0].message.content;
      } else {
        text = JSON.stringify(aiResp);
      }
      console.log(`[evaluate-batch] AI output:\n${text}`);
      batchItems = parseBatchAIResponse(text);
      if (batchItems.length === 0) {
        console.error(
          `[evaluate-batch] Failed to parse AI response. Raw:\n${JSON.stringify(aiResp)}`,
        );
        return Response.json(
          { error: "AI returned invalid output", raw: text },
          { status: 502 },
        );
      }
    }

    // Build a lookup map: txId → batch result
    const resultMap = new Map<number, BatchAIItem>();
    for (const item of batchItems) {
      const id = Number(item.id);
      if (!isNaN(id)) resultMap.set(id, item);
    }

    // Apply tags for each transaction.
    const results: { id: number; assigned: string[] }[] = [];
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const item = resultMap.get(tx.id);
      const alreadySet = new Set(alreadyPerTx[i]);
      const assignedPaths: string[] = [];

      if (item && Array.isArray(item.tags)) {
        // Stage 1: sanitize + drop rejected/reserved.
        const sanitized: string[] = [];
        for (const raw of item.tags) {
          const path = sanitizePath(raw);
          if (!path) continue;
          const segs = path.split("/");
          let banned = false;
          for (let s = 1; s <= segs.length; s++) {
            if (rejectedSet.has(segs.slice(0, s).join("/"))) {
              banned = true;
              break;
            }
          }
          if (!banned) sanitized.push(path);
        }

        // Stage 2: drop ancestors of deeper paths.
        const allDeeper = new Set([...sanitized, ...alreadyPerTx[i]]);
        const deduped = sanitized.filter((p) => {
          for (const other of allDeeper) {
            if (other !== p && other.startsWith(p + "/")) return false;
          }
          return true;
        });

        // Stage 3: drop exact duplicates of already-assigned.
        const remaining = deduped.filter((p) => !alreadySet.has(p));

        // Stage 4: cap new tags at MAX_NEW_TAGS.
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

        const reasoning =
          typeof item.reasoning === "string" && item.reasoning.trim()
            ? item.reasoning.trim()
            : null;

        for (const path of accepted) {
          const isNew = !existingSet.has(path);
          await assignTagConsolidated(
            env.DB,
            tx.id,
            userEmail,
            path,
            isNew ? "llm" : "user",
            isNew ? "unconfirmed" : "confirmed",
            isNew ? reasoning : null,
          );
          assignedPaths.push(path);
          // Keep existingSet up-to-date for subsequent transactions in this batch.
          if (isNew) existingSet.add(path);
        }
      }

      results.push({ id: tx.id, assigned: assignedPaths });
    }

    // Mark ALL batch transactions as evaluated regardless of tag outcome.
    const placeholders = txIds.map(() => "?").join(", ");
    await env.DB.prepare(
      `UPDATE transactions SET ai_evaluated = CAST(strftime('%s', 'now') AS INTEGER) WHERE id IN (${placeholders}) AND user_email = ?`,
    )
      .bind(...txIds, userEmail)
      .run();

    return Response.json({ processed: txs.length, results });
  } catch (err) {
    console.error("[evaluate-batch] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
