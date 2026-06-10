import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { evaluateMerchantPatterns } from "../../lib/merchant-patterns";

/**
 * POST /api/transactions/evaluate-merchant-all-force
 * Re-evaluates ALL transactions against the dictionary, regardless of flag.
 */
export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env);

    const rows = await env.DB.prepare(
      `SELECT id, remittance_info, counterparty_name FROM transactions
       WHERE user_email = ?`,
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

    const CHUNK_SIZE = 20; // Process in Chunks of 20 to protect D1 connections
    let matched = 0;

    for (let i = 0; i < rows.results.length; i += CHUNK_SIZE) {
      const chunk = rows.results.slice(i, i + CHUNK_SIZE);

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
