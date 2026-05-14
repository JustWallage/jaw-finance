import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import {
  assignTagConsolidated,
  fetchHistoricalTagFrequencies,
} from "../../../lib/tag-utils";
import type { DBTag, DBTransaction } from "../../../../db/types";
import {
  isReservedAutoPath,
  formatTagForPrompt,
  filterSuggestedTags,
  buildSinglePrompt,
  SYSTEM_PROMPT,
  MAX_NEW_TAGS,
} from "../../../lib/ai-prompt-building";
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

    const descriptionFrequencies = tx.remittance_info
      ? await fetchHistoricalTagFrequencies(
          env.DB,
          "remittance_info",
          tx.remittance_info,
          txId,
          userEmail,
        )
      : [];
    const counterpartyFrequencies = tx.counterparty_name?.trim()
      ? await fetchHistoricalTagFrequencies(
          env.DB,
          "counterparty_name",
          tx.counterparty_name,
          txId,
          userEmail,
        )
      : null;

    const userMessage = buildSinglePrompt(
      tx,
      alreadyAssigned,
      existingFormatted,
      rejected,
      descriptionFrequencies,
      counterpartyFrequencies,
    );

    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    let parsed: ParsedEvalResponse;
    if (useMock) {
      parsed = mockResponse(existing);
    } else {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ];
      const aiResp = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" satisfies Parameters<
          typeof env.AI.run
        >[0],
        { messages, max_tokens: 300 },
      );
      console.log(
        `[evaluate] Input:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n\n")}\nAI raw:\n${JSON.stringify(aiResp)}`,
      );
      parsed = parseSingleEvalResponse(aiResp);
      if (parsed.tags.length === 0 && !parsed.reasoning) {
        console.error(
          `[evaluate] Failed to parse AI response. Raw:\n${JSON.stringify(aiResp)}`,
        );
        return Response.json(
          { error: "AI returned invalid output", raw: JSON.stringify(aiResp) },
          { status: 502 },
        );
      }
    }

    const accepted = filterSuggestedTags(
      parsed.tags,
      new Set(rejected),
      new Set(existing),
      new Set(alreadyAssigned),
      MAX_NEW_TAGS,
    );

    const existingSet = new Set(existing);
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

    await env.DB.prepare(
      "UPDATE transactions SET ai_evaluated = CAST(strftime('%s', 'now') AS INTEGER) WHERE id = ? AND user_email = ?",
    )
      .bind(txId, userEmail)
      .run();

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
