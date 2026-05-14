import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import {
  assignTagConsolidated,
  fetchHistoricalTagFrequencies,
} from "../../lib/tag-utils";
import type { DBTag, DBTransaction } from "../../../db/types";
import {
  isReservedAutoPath,
  formatTagForPrompt,
  filterSuggestedTags,
  buildBatchPrompt,
  BATCH_SYSTEM_PROMPT,
  MAX_NEW_TAGS,
} from "../../lib/ai-prompt-building";
import {
  parseBatchEvalResponse,
  type BatchEvalItem,
} from "../../lib/ai-response";

const BATCH_SIZE = 50;

function mockBatchResponse(txs: DBTransaction[]): BatchEvalItem[] {
  return txs.map((tx) => ({
    id: String(tx.id),
    reasoning: "Deterministic mock reasoning for E2E tests.",
    tags: ["ai-mock/new-parent/new-leaf"],
  }));
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);

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

    // Build per-transaction RAG context and already-assigned tags.
    const ragContexts: {
      desc: { path: string; percentage: number }[];
      counterparty: { path: string; percentage: number }[] | null;
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

    const userMessage = buildBatchPrompt(
      txs,
      existingFormatted,
      rejected,
      ragContexts,
      alreadyPerTx,
    );

    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let batchItems: BatchEvalItem[];
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
      console.log(`[evaluate-batch] AI output:\n${JSON.stringify(aiResp)}`);
      batchItems = parseBatchEvalResponse(aiResp);
      if (batchItems.length === 0) {
        console.error(
          `[evaluate-batch] Failed to parse AI response. Raw:\n${JSON.stringify(aiResp)}`,
        );
        return Response.json(
          { error: "AI returned invalid output", raw: JSON.stringify(aiResp) },
          { status: 502 },
        );
      }
    }

    // Build a lookup map: txId → batch result
    const resultMap = new Map<number, BatchEvalItem>();
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
        const accepted = filterSuggestedTags(
          item.tags,
          rejectedSet,
          existingSet,
          alreadySet,
          MAX_NEW_TAGS,
        );

        const reasoning = item.reasoning;

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
          if (isNew) existingSet.add(path);
        }
      }

      results.push({ id: tx.id, assigned: assignedPaths });
    }

    // Mark ALL batch transactions as evaluated.
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
