import type { DBTransaction } from "../../db/types";
import { exampleTagList } from "../api/transactions/[id]/example-tags";

export const MAX_NEW_TAGS = 5;

export const SYSTEM_PROMPT = `You are a financial categorization AI. You use hierarchical Materialized Path tags (e.g., "food/groceries", "subscriptions/entertainment").

Core principle: Accuracy over everything. Categorize the transaction based on its description and counterparty. 

Rules:
1. ALREADY TAGGED: If the transaction is perfectly described by the ALREADY list, return an empty tags array.
2. USE EXISTING: Prefer reusing tags from the EXISTING list if they fit perfectly.
3. EXTEND & INVENT: Treat the EXISTING list as a structural blueprint. If a specific tag is missing, you MUST invent it. You can extend existing paths (e.g., if you see "subscriptions/health", you can invent "subscriptions/health/basicfit") or create entirely new paths following the same logic. DO NOT exceed ${MAX_NEW_TAGS} new tags.
4. NO REDUNDANCY: Always output the deepest specific path. NEVER output a parent and its child together (e.g., output "finance/interest", NOT "finance" and "finance/interest").
5. REJECTED: NEVER suggest any tag found in the REJECTED list.
6. SYSTEM RESERVED: Do NOT suggest the standalone tags 'income' or 'expense'.
7. FORMAT: Use lowercase kebab-case segments separated by '/'.
8. HISTORICAL PATTERNS: Pay strong attention to the historical tag frequencies in the user message. These percentages show how often the user historically applied each tag to transactions with this exact description or counterparty — they are a strong signal of user intent.

CRITICAL: You must output ONLY valid JSON containing a "reasoning" string (explain what the transaction is) and a "tags" array.

Example output:
{"reasoning": "Payment to an energy provider for monthly utilities.", "tags": ["home/utilities", "energy-company"]}
`;

export const BATCH_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are processing a BATCH of transactions. You must return a JSON ARRAY (not a single object).
Each element must follow this schema exactly: {"id": "<transaction_id>", "reasoning": "...", "tags": ["path1", "path2"]}.
If no tags apply to a transaction, return an empty tags array for it. Include every input transaction id in the output.
Output ONLY the JSON array, nothing else.`;

export interface HistoricalFrequency {
  path: string;
  percentage: number;
}

export function isReservedAutoPath(p: string): boolean {
  return (
    p === "income" ||
    p === "expense" ||
    /^year-\d{4}(\/|$)/.test(p) ||
    /^month-\d{4}-\d{2}(\/|$)/.test(p) ||
    /^day-\d{4}-\d{2}-\d{2}(\/|$)/.test(p)
  );
}

export function sanitizePath(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .replace(/[^a-z0-9/_-]/g, "-");
  if (!cleaned) return null;
  if (isReservedAutoPath(cleaned)) return null;
  return cleaned;
}

export function formatTagForPrompt(
  path: string,
  reasoning: string | null,
): string {
  return reasoning ? `${path} (${reasoning})` : path;
}

/** 4-stage tag filtering pipeline:
 *  1. Sanitize + drop rejected/banned/reserved
 *  2. Drop ancestors when a deeper path exists
 *  3. Drop exact duplicates of already-assigned
 *  4. Cap brand-new tags at maxNew */
export function filterSuggestedTags(
  rawTags: string[],
  rejected: Set<string>,
  existing: Set<string>,
  alreadyAssigned: Set<string>,
  maxNew: number,
): string[] {
  // Stage 1
  const sanitized: string[] = [];
  for (const raw of rawTags) {
    const path = sanitizePath(raw);
    if (!path) continue;
    const segs = path.split("/");
    let banned = false;
    for (let i = 1; i <= segs.length; i++) {
      if (rejected.has(segs.slice(0, i).join("/"))) {
        banned = true;
        break;
      }
    }
    if (!banned) sanitized.push(path);
  }

  // Stage 2
  const allDeeper = new Set([...sanitized, ...alreadyAssigned]);
  const deduped = sanitized.filter((p) => {
    for (const other of allDeeper) {
      if (other !== p && other.startsWith(p + "/")) return false;
    }
    return true;
  });

  // Stage 3
  const remaining = deduped.filter((p) => !alreadyAssigned.has(p));

  // Stage 4
  const accepted: string[] = [];
  let newCount = 0;
  for (const p of remaining) {
    if (existing.has(p)) {
      accepted.push(p);
    } else if (newCount < maxNew) {
      accepted.push(p);
      newCount++;
    }
  }
  return accepted;
}

function formatFrequencies(freqs: HistoricalFrequency[]): string {
  return freqs.length > 0
    ? freqs.map((f) => `${f.path} (${f.percentage}%)`).join("\n")
    : "None";
}

export function buildSinglePrompt(
  tx: DBTransaction,
  alreadyAssigned: string[],
  existingFormatted: string[],
  rejected: string[],
  descriptionFrequencies: HistoricalFrequency[],
  counterpartyFrequencies: HistoricalFrequency[] | null,
  userExplanation?: string,
): string {
  const exampleFormatted = exampleTagList.map((e) =>
    formatTagForPrompt(e.path, e.reasoning),
  );
  const existingPlusExamples = [...existingFormatted, ...exampleFormatted];

  let historicalSection = `Tags of previous transactions with the exact same description:\n${formatFrequencies(descriptionFrequencies)}`;
  if (counterpartyFrequencies !== null) {
    historicalSection += `\n\nTags of previous transactions with the exact same counterparty name:\n${formatFrequencies(counterpartyFrequencies)}`;
  }

  const explanationSection = userExplanation
    ? `\nUser's explanation of this transaction: "${userExplanation}"\n`
    : "";

  return `Transaction:
- Date: ${tx.booking_date ?? "unknown"}
- Amount: ${tx.credit_debit === "CRDT" ? "+" : "-"}${tx.amount} ${tx.currency} (${tx.credit_debit === "CRDT" ? "income" : "expense"})
- Counterparty: ${tx.counterparty_name ?? "unknown"}
- Description: ${tx.remittance_info ?? "(none)"}
${explanationSection}
${historicalSection}

ALREADY on this transaction (do not re-suggest these or their parents): ${JSON.stringify(alreadyAssigned)}
EXISTING tags you may reuse — format "path (reasoning)" or "path": ${JSON.stringify(existingPlusExamples)}
REJECTED (NEVER suggest): ${JSON.stringify(rejected)}

Respond with JSON only.`;
}

export function buildBatchPrompt(
  txs: DBTransaction[],
  existingFormatted: string[],
  rejected: string[],
  ragContexts: {
    desc: HistoricalFrequency[];
    counterparty: HistoricalFrequency[] | null;
  }[],
  alreadyPerTx: string[][],
): string {
  const exampleFormatted = exampleTagList.map((e) =>
    formatTagForPrompt(e.path, e.reasoning),
  );
  const existingPlusExamples = [...existingFormatted, ...exampleFormatted];

  const batchInput = txs.map((tx, i) => {
    const { desc, counterparty } = ragContexts[i];
    const descBlock =
      desc.length > 0
        ? desc.map((f) => `${f.path} (${f.percentage}%)`).join(", ")
        : "None";
    let ragStr = `desc_history: ${descBlock}`;
    if (counterparty !== null) {
      const cpBlock =
        counterparty.length > 0
          ? counterparty.map((f) => `${f.path} (${f.percentage}%)`).join(", ")
          : "None";
      ragStr += ` | counterparty_history: ${cpBlock}`;
    }
    return {
      id: String(tx.id),
      date: tx.booking_date ?? "unknown",
      amount: `${tx.credit_debit === "CRDT" ? "+" : "-"}${tx.amount} ${tx.currency}`,
      counterparty: tx.counterparty_name ?? "unknown",
      description: tx.remittance_info ?? "(none)",
      historical_tags: ragStr,
      already_assigned: alreadyPerTx[i],
    };
  });

  return `EXISTING tags you may reuse: ${JSON.stringify(existingPlusExamples)}
REJECTED (NEVER suggest): ${JSON.stringify(rejected)}

Transactions to evaluate:
${JSON.stringify(batchInput, null, 2)}

Respond with a JSON array only.`;
}
