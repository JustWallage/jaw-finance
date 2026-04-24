import type { EBEnv } from "./enable-banking";
import { assignTagConsolidated } from "./tag-utils";

/**
 * Auto-tag a transaction with basic tags: income/expense and year-YYYY/month-MM/day-DD.
 * Only assigns the deepest tag per lineage (day-level for dates).
 * Ancestor tags are created in the tags table but not linked to the transaction.
 */
export async function autoTagTransaction(
  db: EBEnv["DB"],
  transactionId: number,
  creditDebit: string,
  bookingDate: string | null,
  userEmail: string,
): Promise<void> {
  if (creditDebit === "CRDT") {
    await assignTagConsolidated(db, transactionId, userEmail, "income", "system", "confirmed", null);
  } else if (creditDebit === "DBIT") {
    await assignTagConsolidated(db, transactionId, userEmail, "expense", "system", "confirmed", null);
  }

  if (bookingDate) {
    const d = new Date(bookingDate + "T00:00:00Z");
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");

    const dayPath = `year-${year}/month-${month}/day-${day}`;
    await assignTagConsolidated(db, transactionId, userEmail, dayPath, "system", "confirmed", null);
  }
}
