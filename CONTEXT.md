# jaw-finance

A personal finance dashboard that connects to banks via Open Banking (PSD2), fetches transactions, and uses AI to categorize them with hierarchical tags.

## Language

**Transaction**: A single bank account entry (debit or credit) fetched from Enable Banking.
_Avoid_: Payment, entry, line item

**Tag**: A hierarchical label following the Materialized Path pattern (e.g., `food/groceries/albert-heijn`). Assigned to transactions for categorization.
_Avoid_: Category, label, folder

**Tag path**: The full slash-separated string identifying a tag's position in the hierarchy.

**Leaf tag**: The deepest tag explicitly assigned to a transaction. Ancestors exist in the `tags` table but are not linked via `transaction_tags`.
_Avoid_: Child tag, end node

**Evaluation**: The process of asking an LLM to suggest tags for a transaction. Can be single (one transaction) or batch (up to 50).
_Avoid_: Classification, categorization, tagging

**RAG context**: Historical tag frequency data injected into the LLM prompt. Shows how often the user tagged similar past transactions with each tag.

**Tag filtering pipeline**: Server-side post-processing of LLM-suggested tags. Four stages: sanitize → deduplicate ancestors → remove already-assigned → cap new tags.
_Avoid_: Validation, cleaning

**Consent**: GDPR/PSD2 user consent record. Required before any API interaction beyond `/api/consent` and `/api/health`.

**Bank connection**: An active link to a bank account via Enable Banking. Scoped to a user and has an expiry date.

## Relationships

- A **Transaction** belongs to exactly one **Bank connection**
- A **Transaction** can have many **Tags** (via `transaction_tags` junction)
- A **Tag** belongs to one user and has a unique **Tag path** per user
- An **Evaluation** reads **Transactions**, queries **RAG context**, and produces suggested **Tags**
- The **Tag filtering pipeline** processes LLM output before **Tags** are assigned

## Example dialogue

> **Dev:** "When a user runs a batch **Evaluation**, does it overwrite existing **Tags**?"
> **Domain expert:** "No — the **Tag filtering pipeline** drops any **Tag** already on the **Transaction**. It also drops ancestors if a deeper **Leaf tag** is suggested. The LLM's `reasoning` is stored only on the **Leaf tag**, not on auto-created ancestors."

## Flagged ambiguities

- "auto-tag" was used for both system tags (income/expense/date hierarchy) and LLM-suggested tags. Resolved: system auto-tagging is removed. "Evaluation" refers exclusively to LLM-based tag suggestion.
