import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import { isProduction } from "../../../lib/env";
import { enforceRateLimit } from "../../../lib/rate-limit";
import type { DBTransaction } from "../../../../db/types";
import {
  isReservedAutoPath,
  buildSinglePrompt,
  SYSTEM_PROMPT,
} from "../../../lib/ai-prompt-building";
import { AI_MODEL } from "../../../lib/ai-model";
import {
  loadEvaluationContext,
  loadTransactionContext,
  applyEvaluation,
  markEvaluated,
} from "../../../lib/ai-evaluation";
import {
  parseSingleEvalResponse,
  type ParsedEvalResponse,
} from "../../../lib/ai-response";

/** Mock branch for non-production E2E. Returns a deterministic mix of an
 *  existing tag (if any non-system one exists) and a new nested path. */
function mockResponse(existing: string[]): ParsedEvalResponse {
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
    const userEmail = getUserEmail(context.request, env);
    const limited = await enforceRateLimit(env.DB, userEmail, "evaluate", 60, 3600);
    if (limited) return limited;

    const txId = Number((context.params as { id: string }).id);

    let explanation: string | undefined;
    try {
      const body = (await context.request.json()) as {
        explanation?: string;
      };
      explanation = body.explanation?.trim() || undefined;
    } catch {
      // No body or invalid JSON — that's fine, explanation is optional
    }

    const tx = await env.DB.prepare(
      "SELECT * FROM transactions WHERE id = ? AND user_email = ?",
    )
      .bind(txId, userEmail)
      .first<DBTransaction>();

    if (!tx) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    const ctx = await loadEvaluationContext(env.DB, userEmail);
    const txCtx = await loadTransactionContext(env.DB, tx, txId, userEmail);

    const userMessage = buildSinglePrompt(
      tx,
      txCtx.alreadyAssigned,
      ctx.existingFormatted,
      ctx.rejected,
      txCtx.descriptionFrequencies,
      txCtx.counterpartyFrequencies,
      explanation,
    );

    const useMock =
      !isProduction(env.ENVIRONMENT) &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let parsed: ParsedEvalResponse;
    if (useMock) {
      parsed = mockResponse(ctx.existing);
    } else {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ];
      const aiResp = await env.AI.run(AI_MODEL, { messages, max_tokens: 300 });
      parsed = parseSingleEvalResponse(aiResp);
      if (parsed.tags.length === 0 && !parsed.reasoning) {
        console.error(
          `[evaluate] Failed to parse AI response. Raw:\n${JSON.stringify(aiResp)}`,
        );
        return Response.json(
          { error: "AI returned invalid output" },
          { status: 502 },
        );
      }
    }

    const assignedPaths = await applyEvaluation(
      env.DB,
      userEmail,
      txId,
      parsed,
      ctx,
      new Set(txCtx.alreadyAssigned),
    );

    await markEvaluated(env.DB, userEmail, [txId]);

    return Response.json({
      assigned: assignedPaths,
      reasoning: parsed.reasoning,
      ...(useMock && context.request.headers.get("X-Test-Return-Prompt") === "1"
        ? { prompt: userMessage }
        : {}),
    });
  } catch (err) {
    console.error("[evaluate] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
};
