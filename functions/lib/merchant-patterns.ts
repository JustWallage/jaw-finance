import type { EBEnv } from "./enable-banking";
import { assignTagConsolidated } from "./tag-utils";

/**
 * Match a transaction against the global_merchant_patterns table
 * and auto-tag if a match is found.
 * Sets merchant_db_evaluated to the current epoch regardless of match.
 * Does NOT touch ai_evaluated.
 */
export async function evaluateMerchantPatterns(
  db: EBEnv["DB"],
  transactionId: number,
  userEmail: string,
  remittanceInfo: string | null,
  counterpartyName: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Try matching remittance_info first, then counterparty_name
  let match: { paths: string } | null = null;

  if (remittanceInfo) {
    match = await db
      .prepare(
        `SELECT paths FROM global_merchant_patterns WHERE ? GLOB pattern LIMIT 1`,
      )
      .bind(remittanceInfo)
      .first<{ paths: string }>();
  }

  if (!match && counterpartyName) {
    match = await db
      .prepare(
        `SELECT paths FROM global_merchant_patterns WHERE ? GLOB pattern LIMIT 1`,
      )
      .bind(counterpartyName)
      .first<{ paths: string }>();
  }

  if (match) {
    const tagPaths: string[] = JSON.parse(match.paths);
    for (const tagPath of tagPaths) {
      await assignTagConsolidated(
        db,
        transactionId,
        userEmail,
        tagPath,
        "system",
        "confirmed",
        null,
      );
    }
  }

  await db
    .prepare(
      `UPDATE transactions SET merchant_db_evaluated = ? WHERE id = ?`,
    )
    .bind(now, transactionId)
    .run();
}
