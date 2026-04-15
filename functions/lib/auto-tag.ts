import type { EBEnv } from "./enable-banking";

/**
 * Auto-tag a transaction with basic tags: income/expense and year-YYYY/month-MM/day-DD.
 * Creates tags if they don't exist, then links them to the transaction.
 */
export async function autoTagTransaction(
  db: EBEnv["DB"],
  transactionId: number,
  creditDebit: string,
  bookingDate: string | null,
  userEmail: string,
): Promise<void> {
  const tagPaths: { name: string; path: string }[] = [];

  // Financial flow tag
  if (creditDebit === "CRDT") {
    tagPaths.push({ name: "income", path: "income" });
  } else if (creditDebit === "DBIT") {
    tagPaths.push({ name: "expense", path: "expense" });
  }

  // Date tags (hierarchical: year-YYYY/month-MM/day-DD)
  if (bookingDate) {
    const d = new Date(bookingDate + "T00:00:00Z");
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");

    const yearPath = `year-${year}`;
    const monthPath = `${yearPath}/month-${month}`;
    const dayPath = `${monthPath}/day-${day}`;

    tagPaths.push({ name: `year-${year}`, path: yearPath });
    tagPaths.push({ name: `month-${month}`, path: monthPath });
    tagPaths.push({ name: `day-${day}`, path: dayPath });
  }

  for (const { name, path } of tagPaths) {
    // Upsert tag
    const tag = await db
      .prepare(
        `INSERT INTO tags (user_email, name, path)
         VALUES (?, ?, ?)
         ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
         RETURNING id`,
      )
      .bind(userEmail, name, path)
      .first<{ id: number }>();

    if (tag) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
        )
        .bind(transactionId, tag.id)
        .run();
    }
  }
}
