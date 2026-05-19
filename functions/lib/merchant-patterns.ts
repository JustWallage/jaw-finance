import type { EBEnv } from "./enable-banking";
import { assignTagConsolidated } from "./tag-utils";

/**
 * Helper function to convert SQLite GLOB syntax (* and ?)
 * into a case-insensitive JavaScript Regular Expression.
 */
function isGlobMatch(text: string | null, glob: string): boolean {
  if (!text) return false;
  // Escape standard regex characters, then convert GLOB wildcards to Regex wildcards
  const regexStr =
    "^" +
    glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") +
    "$";
  return new RegExp(regexStr, "i").test(text); // "i" makes it case-insensitive
}

/**
 * Match a transaction against the pre-loaded in-memory patterns.
 * Sets merchant_db_evaluated to the current epoch regardless of match.
 * Does NOT touch ai_evaluated.
 */
export async function evaluateMerchantPatterns(
  db: EBEnv["DB"],
  transactionId: number,
  userEmail: string,
  remittanceInfo: string | null,
  counterpartyName: string | null,
  patterns: Array<{ pattern: string; paths: string }>, // Accept patterns as an argument
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  let match: { paths: string } | null = null;

  // In-memory matching loop (0 database calls!)
  for (const p of patterns) {
    if (
      isGlobMatch(remittanceInfo, p.pattern) ||
      isGlobMatch(counterpartyName, p.pattern)
    ) {
      match = p;
      break; // Stop at first match
    }
  }

  // If matched, hit the database to assign tags
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

  // Hit the database to update the evaluated flag
  await db
    .prepare(`UPDATE transactions SET merchant_db_evaluated = ? WHERE id = ?`)
    .bind(now, transactionId)
    .run();

  return !!match;
}
