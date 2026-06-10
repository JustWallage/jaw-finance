import type { EBEnv } from "./enable-banking";
import type { DBTag, DBTransaction } from "../../db/types";
import {
  isReservedAutoPath,
  formatTagForPrompt,
  filterSuggestedTags,
  MAX_NEW_TAGS,
  type HistoricalFrequency,
} from "./ai-prompt-building";
import {
  assignTagConsolidated,
  fetchHistoricalTagFrequencies,
} from "./tag-utils";

export interface EvaluationContext {
  existing: string[];
  existingSet: Set<string>;
  existingFormatted: string[];
  rejected: string[];
  rejectedSet: Set<string>;
}

export async function loadEvaluationContext(
  db: EBEnv["DB"],
  userEmail: string,
): Promise<EvaluationContext> {
  const allTags = await db
    .prepare("SELECT * FROM tags WHERE user_email = ?")
    .bind(userEmail)
    .all<DBTag>();

  const existingTags = allTags.results.filter(
    (t) =>
      (t.status === "confirmed" || t.status === "unconfirmed") &&
      !isReservedAutoPath(t.path),
  );
  const existing = existingTags.map((t) => t.path);
  const rejected = allTags.results
    .filter((t) => t.status === "rejected")
    .map((t) => t.path);

  return {
    existing,
    existingSet: new Set(existing),
    existingFormatted: existingTags.map((t) =>
      formatTagForPrompt(t.path, t.reasoning),
    ),
    rejected,
    rejectedSet: new Set(rejected),
  };
}

export interface TransactionContext {
  descriptionFrequencies: HistoricalFrequency[];
  counterpartyFrequencies: HistoricalFrequency[] | null;
  alreadyAssigned: string[];
}

export async function loadTransactionContext(
  db: EBEnv["DB"],
  tx: DBTransaction,
  excludeTxIds: number | number[],
  userEmail: string,
): Promise<TransactionContext> {
  const descriptionFrequencies = tx.remittance_info
    ? await fetchHistoricalTagFrequencies(
        db,
        "remittance_info",
        tx.remittance_info,
        excludeTxIds,
        userEmail,
      )
    : [];
  const counterpartyFrequencies = tx.counterparty_name?.trim()
    ? await fetchHistoricalTagFrequencies(
        db,
        "counterparty_name",
        tx.counterparty_name,
        excludeTxIds,
        userEmail,
      )
    : null;

  const alreadyRows = await db
    .prepare(
      `SELECT t.path FROM tags t
       JOIN transaction_tags tt ON tt.tag_id = t.id
       WHERE tt.transaction_id = ? AND t.user_email = ?`,
    )
    .bind(tx.id, userEmail)
    .all<{ path: string }>();
  const alreadyAssigned = alreadyRows.results
    .map((r) => r.path)
    .filter((p) => !isReservedAutoPath(p));

  return { descriptionFrequencies, counterpartyFrequencies, alreadyAssigned };
}

/** Filter suggested tags and assign accepted ones to the transaction.
 *  New paths: source 'llm', status 'unconfirmed', reasoning on the leaf only.
 *  Reused paths: 'user'/'confirmed'/null (ON CONFLICT preserves existing rows).
 *  With `growExistingSet`, newly created paths are added to ctx.existingSet so
 *  later transactions in the same batch treat them as existing. */
export async function applyEvaluation(
  db: EBEnv["DB"],
  userEmail: string,
  txId: number,
  suggestion: { reasoning: string | null; tags: string[] },
  ctx: EvaluationContext,
  alreadyAssigned: Set<string>,
  growExistingSet = false,
): Promise<string[]> {
  const accepted = filterSuggestedTags(
    suggestion.tags,
    ctx.rejectedSet,
    ctx.existingSet,
    alreadyAssigned,
    MAX_NEW_TAGS,
  );

  const assignedPaths: string[] = [];
  for (const path of accepted) {
    const isNew = !ctx.existingSet.has(path);
    await assignTagConsolidated(
      db,
      txId,
      userEmail,
      path,
      isNew ? "llm" : "user",
      isNew ? "unconfirmed" : "confirmed",
      isNew ? suggestion.reasoning : null,
    );
    assignedPaths.push(path);
    if (isNew && growExistingSet) ctx.existingSet.add(path);
  }
  return assignedPaths;
}

export async function markEvaluated(
  db: EBEnv["DB"],
  userEmail: string,
  txIds: number[],
): Promise<void> {
  const placeholders = txIds.map(() => "?").join(", ");
  await db
    .prepare(
      `UPDATE transactions SET ai_evaluated = CAST(strftime('%s', 'now') AS INTEGER) WHERE id IN (${placeholders}) AND user_email = ?`,
    )
    .bind(...txIds, userEmail)
    .run();
}
