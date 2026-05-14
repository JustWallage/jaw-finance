import { getUserEmail, type EBEnv } from "../lib/enable-banking";
import { executeTagQuery, type QueryObject } from "../lib/query-utils";
import { extractAIText, parseQueryArray } from "../lib/ai-response";
import type { DBTag } from "../../db/types";

const QUERY_SYSTEM_PROMPT = `You are a financial query translator. The current date and time is: {{CURRENT_DATETIME}}.

You translate natural language questions about personal finances into structured JSON queries.
The user has a set of hierarchical tags on their transactions (e.g., "food/groceries", "transport/public/train").
You must output ONLY a valid JSON array of query objects. No prose, no explanation, no markdown.

Each query object has:
- "tagGlobs": string[] (REQUIRED) — SQLite GLOB patterns to match tag paths. Use * for single-level wildcard, e.g. "food/*". Use "food" for exact match.
- "startDate": string (optional) — YYYY-MM-DD format, inclusive
- "endDate": string (optional) — YYYY-MM-DD format, inclusive

Multiple objects in the array are combined with OR logic.

AVAILABLE TAGS:
{{TAGS}}

Examples:
- "How much did I spend on food this month?" → [{"tagGlobs":["food","food/*"],"startDate":"2026-04-01","endDate":"2026-04-30"}]
- "Show me all transport and food transactions" → [{"tagGlobs":["transport","transport/*"]},{"tagGlobs":["food","food/*"]}]
- "What were my expenses last year?" → [{"tagGlobs":["expense"],"startDate":"2025-01-01","endDate":"2025-12-31"}]

Output ONLY the JSON array.`;

const SUMMARY_SYSTEM_PROMPT = `You are a friendly financial assistant. Given the user's original question and query results, write a short friendly message that answers their question. Use the exact numbers provided. Do not output JSON. Only plain text.`;

function mockQueryResponse(): QueryObject[] {
  return [{ tagGlobs: ["food", "food/*"] }];
}

function mockSummaryResponse(
  count: number,
  totalIncome: number,
  totalExpense: number,
): string {
  return totalExpense > 0
    ? `You spent ${totalExpense.toFixed(2)} EUR on food across ${count} transactions.`
    : `Found ${count} transactions with ${totalIncome.toFixed(2)} EUR income and ${totalExpense.toFixed(2)} EUR expenses.`;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const body = (await context.request.json()) as { question: string };

    if (
      !body.question ||
      typeof body.question !== "string" ||
      !body.question.trim()
    ) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    const question = body.question.trim();

    const useMock =
      env.ENVIRONMENT !== "production" &&
      context.request.headers.get("X-Test-Mock-AI") === "1";

    // Fetch user tags (confirmed + unconfirmed, excluding rejected)
    const allTags = await env.DB.prepare(
      "SELECT path FROM tags WHERE user_email = ? AND status != 'rejected'",
    )
      .bind(userEmail)
      .all<Pick<DBTag, "path">>();
    const tagPaths = allTags.results.map((t) => t.path);

    // Pass 1: Generate structured query
    let queries: QueryObject[];
    if (useMock) {
      queries = mockQueryResponse();
    } else {
      const systemPrompt = QUERY_SYSTEM_PROMPT.replace(
        "{{CURRENT_DATETIME}}",
        new Date().toISOString(),
      ).replace("{{TAGS}}", JSON.stringify(tagPaths));

      const aiResp = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" satisfies Parameters<
          typeof env.AI.run
        >[0],
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 500,
        },
      );
      console.log(
        `[chat] Pass 1 input: system=${systemPrompt}\nuser=${question}\n[chat] Pass 1 output:\n${JSON.stringify(aiResp)}`,
      );

      const parsed = parseQueryArray(aiResp);
      if (!parsed || parsed.length === 0) {
        return Response.json({
          summary:
            "I couldn't understand that question. Try asking about your spending on specific categories or time periods.",
          transactions: [],
          totalIncome: 0,
          totalExpense: 0,
        });
      }
      queries = parsed;
    }

    // Execute the query
    const result = await executeTagQuery(env.DB, userEmail, queries);

    // Pass 2: Generate summary
    let summary: string;
    if (useMock) {
      summary = mockSummaryResponse(
        result.transactions.length,
        result.totalIncome,
        result.totalExpense,
      );
    } else {
      const summaryUserMsg = `Question: "${question}"\nResults: ${result.transactions.length} transactions, total income: ${result.totalIncome.toFixed(2)} EUR, total expenses: ${result.totalExpense.toFixed(2)} EUR.`;
      console.log(
        `[chat] Pass 2 input: system=${SUMMARY_SYSTEM_PROMPT}\nuser=${summaryUserMsg}`,
      );
      const summaryResp = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" satisfies Parameters<
          typeof env.AI.run
        >[0],
        {
          messages: [
            { role: "system", content: SUMMARY_SYSTEM_PROMPT },
            { role: "user", content: summaryUserMsg },
          ],
          max_tokens: 150,
        },
      );
      console.log(`[chat] Pass 2 output:\n${JSON.stringify(summaryResp)}`);
      summary = extractAIText(summaryResp).trim() || "Here are your results.";
    }

    return Response.json({
      summary,
      transactions: result.transactions,
      totalIncome: result.totalIncome,
      totalExpense: result.totalExpense,
    });
  } catch (err) {
    console.error("[chat] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
