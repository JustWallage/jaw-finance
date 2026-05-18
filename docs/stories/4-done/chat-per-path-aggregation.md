# Chat endpoint: per-path tag aggregation in query results

## Problem

The chat endpoint's Pass 2 (summarizer) only receives flat totals: `N transactions, X EUR income, Y EUR expenses`. It has no visibility into the breakdown per tag path, so it can't write detailed answers like "You spent €80 on groceries (€50 at Jumbo, €30 at Albert Heijn) and €25 at restaurants."

## Solution

Add a `aggregateByTagPath` function to `functions/lib/query-utils.ts` that computes per-path aggregation with ancestor rollup and single-child pruning. The chat endpoint calls it after `executeTagQuery` and passes the breakdown to the summarizer.

### Interface

```ts
interface PathAggregation {
  path: string;
  totalIncome: number;
  totalExpense: number;
  count: number;
}

async function aggregateByTagPath(
  db: D1Database,
  transactionIds: number[],
): Promise<PathAggregation[]>
```

### Algorithm

1. **Single SQL query** — group by `t.path` on the matched transaction IDs:
   ```sql
   SELECT t.path,
     COUNT(DISTINCT tx.id) as count,
     SUM(CASE WHEN tx.credit_debit = 'CRDT' THEN CAST(tx.amount AS REAL) ELSE 0 END) as total_income,
     SUM(CASE WHEN tx.credit_debit = 'DBIT' THEN CAST(tx.amount AS REAL) ELSE 0 END) as total_expense
   FROM transactions tx
   JOIN transaction_tags tt ON tx.id = tt.transaction_id
   JOIN tags t ON tt.tag_id = t.id
   WHERE tx.id IN (...)
   GROUP BY t.path
   ```

2. **Ancestor rollup (JS)** — for each leaf path (e.g. `food/groceries/jumbo`), compute all ancestor prefixes (`food/groceries`, `food`) and accumulate their totals by summing children.

3. **Single-child pruning** — omit any ancestor path that has only 1 distinct child path in the result set. These add no information beyond what their single child already provides.

### Example

Input transactions:
- Tx A: tagged `food/groceries/jumbo`, -€50
- Tx B: tagged `food/groceries/albert-heijn`, -€30
- Tx C: tagged `food/restaurants/mini-italy`, -€25

Output:
```json
[
  { "path": "food", "totalIncome": 0, "totalExpense": 105, "count": 3 },
  { "path": "food/groceries", "totalIncome": 0, "totalExpense": 80, "count": 2 },
  { "path": "food/groceries/jumbo", "totalIncome": 0, "totalExpense": 50, "count": 1 },
  { "path": "food/groceries/albert-heijn", "totalIncome": 0, "totalExpense": 30, "count": 1 },
  { "path": "food/restaurants/mini-italy", "totalIncome": 0, "totalExpense": 25, "count": 1 }
]
```

Note: `food/restaurants` is omitted because it only has 1 child in the result set.

### Chat endpoint changes

In `functions/api/chat.ts`:
1. After `executeTagQuery`, call `aggregateByTagPath(env.DB, result.transactions.map(t => t.id))`.
2. Pass the breakdown to the Pass 2 summarizer prompt alongside the flat totals.
3. Include the breakdown in the API response (new `tagBreakdown` field).

### Constraints

- `executeTagQuery` remains unchanged.
- The new function lives in `query-utils.ts`.
- No new DB migrations needed (uses existing tables/indexes).
- Must update `nl-chat.spec.ts` mock assertions if the response shape changes.
- The mock branch should return a deterministic breakdown matching the mock query results.
