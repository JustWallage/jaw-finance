import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { isProduction } from "../../lib/env";
import { enforceRateLimit } from "../../lib/rate-limit";
import type { DBTransaction } from "../../../db/types";
import {
  buildBatchPrompt,
  BATCH_SYSTEM_PROMPT,
} from "../../lib/ai-prompt-building";
import { AI_MODEL } from "../../lib/ai-model";
import {
  loadEvaluationContext,
  loadTransactionContext,
  applyEvaluation,
  markEvaluated,
  type TransactionContext,
} from "../../lib/ai-evaluation";
import {
  parseBatchEvalResponse,
  type BatchEvalItem,
} from "../../lib/ai-response";

const BATCH_SIZE = 15;

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
    const userEmail = getUserEmail(context.request, env);
    const limited = await enforceRateLimit(env.DB, userEmail, "evaluate-batch", 20, 3600);
    if (limited) return limited;

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

    const ctx = await loadEvaluationContext(env.DB, userEmail);

    const txContexts: TransactionContext[] = [];
    for (const tx of txs) {
      txContexts.push(
        await loadTransactionContext(env.DB, tx, txIds, userEmail),
      );
    }

    const userMessage = buildBatchPrompt(
      txs,
      ctx.existingFormatted,
      ctx.rejected,
      txContexts.map((c) => ({
        desc: c.descriptionFrequencies,
        counterparty: c.counterpartyFrequencies,
      })),
      txContexts.map((c) => c.alreadyAssigned),
    );

    const useMock =
      !isProduction(env.ENVIRONMENT) &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let batchItems: BatchEvalItem[];
    if (useMock) {
      batchItems = mockBatchResponse(txs);
    } else {
      const aiResp = await env.AI.run(AI_MODEL, {
        messages: [
          { role: "system", content: BATCH_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
      });
      batchItems = parseBatchEvalResponse(aiResp);
      if (batchItems.length === 0) {
        console.error(
          `[evaluate-batch] Failed to parse AI response. Raw:\n${JSON.stringify(aiResp)}`,
        );
        return Response.json(
          { error: "AI returned invalid output" },
          { status: 502 },
        );
      }
    }

    const resultMap = new Map<number, BatchEvalItem>();
    for (const item of batchItems) {
      const id = Number(item.id);
      if (!isNaN(id)) resultMap.set(id, item);
    }

    const results: { id: number; assigned: string[] }[] = [];
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const item = resultMap.get(tx.id);
      let assignedPaths: string[] = [];

      if (item && Array.isArray(item.tags)) {
        assignedPaths = await applyEvaluation(
          env.DB,
          userEmail,
          tx.id,
          item,
          ctx,
          new Set(txContexts[i].alreadyAssigned),
          true,
        );
      }

      results.push({ id: tx.id, assigned: assignedPaths });
    }

    // Mark ALL batch transactions as evaluated.
    await markEvaluated(env.DB, userEmail, txIds);

    return Response.json({ processed: txs.length, results });
  } catch (err) {
    console.error("[evaluate-batch] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
};
