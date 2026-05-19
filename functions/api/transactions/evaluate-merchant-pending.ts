import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { evaluateMerchantPatterns } from "../../lib/merchant-patterns";

/**
 * POST /api/transactions/evaluate-merchant-pending
 * Evaluates all transactions where merchant_db_evaluated = 0 against the dictionary.
 */
export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);

    const rows = await env.DB.prepare(
      `SELECT id, remittance_info, counterparty_name FROM transactions
       WHERE user_email = ? AND merchant_db_evaluated = 0`,
    )
      .bind(userEmail)
      .all<{
        id: number;
        remittance_info: string | null;
        counterparty_name: string | null;
      }>();

    // Fetch all patterns ONCE into memory
    const patterns = await env.DB.prepare(
      `SELECT pattern, paths FROM global_merchant_patterns`,
    ).all<{ pattern: string; paths: string }>();

    const CHUNK_SIZE = 20; // Process in Chunks (e.g., 20 at a time) to protect D1 connection limits
    let matched = 0;

    for (let i = 0; i < rows.results.length; i += CHUNK_SIZE) {
      const chunk = rows.results.slice(i, i + CHUNK_SIZE);

      // Run this specific chunk concurrently
      const chunkResults = await Promise.all(
        chunk.map((tx) =>
          evaluateMerchantPatterns(
            env.DB,
            tx.id,
            userEmail,
            tx.remittance_info,
            tx.counterparty_name,
            patterns.results,
          ),
        ),
      );

      matched += chunkResults.filter(Boolean).length;
    }

    return Response.json({ evaluated: matched });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
