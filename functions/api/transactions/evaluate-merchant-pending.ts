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

    let matched = 0;
    for (const tx of rows.results) {
      await evaluateMerchantPatterns(
        env.DB,
        tx.id,
        userEmail,
        tx.remittance_info,
        tx.counterparty_name,
      );
      matched++;
    }

    return Response.json({ evaluated: matched });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
