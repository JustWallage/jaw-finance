# Project Context: jaw-finance Dashboard

Task one: you must keep this document up to date, but only with the broad context of the project. Do not include specific implementation details. Only when significant changes/additions to the project context/stack occur, you must update this document.

## Core Principles

1. **Production-Level Standards:** No hacks, no shortcuts. Built as an active company would build it.
2. **Simplicity:** Minimize dependencies, code, and steps. Do not reinvent the wheel.
3. **Fully Automated:** Zero manual deployments or UI configuration. Everything is managed via GitHub Actions (GHA) and Terraform.
4. **Trunk-Based Development:** Single `main` branch. Commits trigger a linear pipeline: Staging DB Migrations -> Staging Deploy -> E2E Tests -> Prod DB Migrations -> Prod Deploy.

## Tech Stack

- **Project Name:** `jaw-finance`
- **Monorepo:** React UI in `/src`, API in `/functions`, IaC in `/iac`, Tests in `/tests`, Database schemas/types in `/db`.
- **Frontend:** React, Vite, Tailwind CSS, Shadcn UI (must download components, not create them manually). Client-side routing via `react-router-dom` (`/` Home, `/tags` Tags, `/terms` Terms, `/privacy` Privacy) wrapped in a shared `Layout` with a bottom navigation bar. A `ConsentGate` component enforces T&C/privacy consent before the app is usable.
- **Backend:** Cloudflare Pages Functions.
- **Database:** Cloudflare D1 (Two separate instances: Staging and Production), provisioned via Terraform.
  - Database bindings are dynamically templated into `wrangler.toml` during the CI pipeline using Terraform outputs (`wrangler.toml.template` → `wrangler.toml`).
  - D1 Migrations (in `db/migrations`) are automatically applied in the CI pipeline before each environment's code deployment. Configured via `migrations_dir = "db/migrations"` in wrangler configuration.
- **Package Manager:** pnpm.
- **CI/CD:** GitHub Actions.
- **E2E Testing:** Playwright.
- **IaC:** Terraform.
  - Cloudflare resources managed in `/iac` (State stored in Cloudflare R2 bucket: `jaw-finance-tfstate`).
  - DNS (`finance.just.wallage.nl`) managed in an external AWS Route53 repo (CNAME mapped to `jaw-finance.pages.dev`).

## Local Development

- **Frontend only:** `pnpm dev` (Vite dev server on port 5173).
- **Full stack (frontend + Pages Functions + D1):** `pnpm dev:pages` (runs `wrangler pages dev --proxy 5173`, which proxies Vite and serves Pages Functions locally with D1 bindings from `wrangler.toml`).
- **Local DB migrations:** `pnpm migrate:local` applies migrations to the local D1 database.
- **Local DB seeding:** `pnpm seed:local` syncs merchant patterns to the local D1 database.
- **Secrets in local dev:** Set `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_SECRET` in a `.dev.vars` file at the project root (automatically loaded by wrangler). Set `VITE_DEV_USER_EMAIL` in `.env` (loaded by Vite).

## Security & Integrations

- **Authentication:** Cloudflare Access (Zero Trust) protects the application UI.
  - User identity is read from the `Cf-Access-Authenticated-User-Email` header (set automatically by Cloudflare Access in production).
  - All DB records (`bank_connections`, `transactions`) are scoped to `user_email`.
  - In local dev, the frontend sends the header via `VITE_DEV_USER_EMAIL` (in `.env`). The callback retrieves user identity from the OAuth state parameter.
  * In E2E tests, Playwright sends `Cf-Access-Authenticated-User-Email` via `extraHTTPHeaders` locally. In CI, it sends `X-Test-User-Email` (accepted only in staging since service tokens don't populate the CF Access email header).
- **Banking Integration:** Enable Banking (Open Banking / PSD2) via REST API.
  - JWT authentication: RS256 with `ENABLE_BANKING_APP_ID` as `kid` and `ENABLE_BANKING_SECRET` (PEM private key) for signing.
  - OAuth-style redirect flow: `POST /auth` → bank redirect → callback with `code` → `POST /sessions`.
  - Configured dynamically per environment via `ENABLE_BANKING_API_URL` and `ENABLE_BANKING_CALLBACK_URL` environment variables.
  - **Mocking:** A controllable mock implementation exists in `/functions/mock-enable-banking/` for local development and staging E2E tests. It simulates the OAuth flow and returns deterministic data. It must be strictly disabled in production via environment checks.
- **Secrets:** Pages Function secrets set via `wrangler pages secret put` in CI. Uses Cloudflare's secrets API (persists across deployments). GitHub Actions secrets are the source of truth.

## Data Management

- **Database Migrations:** Expand and Contract pattern. Migrations are in `/db/migrations` and run automatically before each environment's code deployment in the CI pipeline.
- **User Consent:** `user_consents` table stores GDPR/PSD2 consent records keyed by `user_email`. A global middleware (`functions/api/_middleware.ts`) intercepts all `/api/*` requests (excluding `/api/consent` and `/api/health`) and returns 403 if the user has not consented.
- **Transaction Storage:** Transactions fetched from Enable Banking are cached in D1. Idempotent upserts using a UNIQUE constraint on `(entry_reference, account_uid)`.
- **Tagging System:** Hierarchical tags using a Materialized Path pattern.
  - `tags` table with `path` column (e.g., `food/groceries`). Many-to-many relationship via `transaction_tags` junction table.
  - Each tag row carries a `status` (`confirmed` | `unconfirmed` | `rejected`), a `source` (`system` | `user` | `llm`), and a nullable `reasoning` text column (a short dictionary-style definition of what the tag means). Manually created and system-generated tags default to `confirmed` with `reasoning=NULL`; LLM-suggested leaf tags are inserted as `unconfirmed` with the LLM's reasoning string. `rejected` tags are kept as a per-user ban list and excluded from default GETs.
  - Ingestion no longer auto-assigns system flow/date tags (`income`/`expense` or date hierarchy paths). Queries and analytics for income/expense rely on transaction fields (`credit_debit`, `booking_date`) rather than implicit system tags.
  - Leaf Node Consolidation: Transactions are strictly linked to the deepest explicitly assigned node in a tag's lineage. Assigning a child tag automatically unlinks any ancestor tags from the transaction to prevent database and UI bloat, while all ancestor tags remain in the `tags` table for hierarchy queries.
  - Aggregation: `by-tags` endpoint (`POST /api/transactions/by-tags`) accepts a `queries` array of objects, each with optional `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), and required `tagGlobs` (string array). Multiple query objects are combined with OR logic. Tag matching uses SQLite's native `GLOB` operator directly against the `path` column — patterns like `vacation/*/food` or `home/*` are passed as-is. Date filtering applies `>=`/`<=` on `booking_date`. A legacy `paths` field is also accepted for backward compatibility (auto-converted to GLOB patterns matching exact path and children). The `/tags` page includes a "Query Tags" section with glob/date inputs and a results modal showing totals and matched transactions.
  - Frontend: `TagSelector` component per transaction row with inline creation, removal, deletion with confirmation. The dedicated `/tags` page splits user-domain tags (source != system) into Unconfirmed and Confirmed sections and exposes a Rejected Tags modal.
  - Rejection: setting `status='rejected'` via `PATCH /api/tags/:id` also deletes all `transaction_tags` rows for that tag, banning it from future LLM suggestions until un-rejected.
- **Merchant Pattern Dictionary:** A global `global_merchant_patterns` table stores GLOB patterns mapped to tag paths (JSON array). During transaction ingestion, each new transaction is matched against patterns (first `remittance_info`, then `counterparty_name`) and auto-tagged with `source='system'`/`status='confirmed'`. A `merchant_db_evaluated` integer column (epoch timestamp, default 0) on `transactions` tracks whether a transaction has been evaluated against the dictionary. This is independent of `ai_evaluated` — both enrichment layers run separately.
  - **Seeding:** Patterns live in `db/seeds/global_merchant_patterns.json`; `scripts/seed-merchant-patterns.mjs` syncs them to D1 (diffing inserts/updates/deletes). CI runs seeding after migrations. Locally: `pnpm seed:local`.
  - **Endpoints:** `POST /api/transactions/evaluate-merchant-pending` (evaluates rows where `merchant_db_evaluated = 0`), `POST /api/transactions/evaluate-merchant-all-force` (re-evaluates all). The `/settings` page exposes both as buttons under a "Merchant Dictionary" card.
- **Mock State:** The Enable Banking mock uses the existing Staging/Local D1 database for state management. All mock-related tables are strictly prefixed with `mock_enable_banking_`.

## AI Integration

- **Provider:** Cloudflare Workers AI via `env.AI` binding (model: `@cf/zai-org/glm-4.7-flash`). The binding is declared in `wrangler.toml(.template)` under `[ai]` and is automatically provisioned by Cloudflare Pages — no Terraform changes are required.
- **On-Demand Evaluation:** `POST /api/transactions/:id/evaluate` builds a prompt from the transaction metadata, the tags already on the transaction (so the LLM doesn't re-suggest them or their parents), the user's reusable tag list (confirmed + unconfirmed) formatted as `"path (reasoning)"` when reasoning exists, and the user's rejected tag list. Surfacing each existing tag's reasoning to the LLM materially improves accuracy on subsequent evaluations. The LLM may reuse any number of existing tags and may also propose new paths even when an existing tag fits — server-side filters drop ancestors of any deeper suggested or already-assigned path, drop rejected paths and their descendants, and cap brand-new paths at 5 per call. The LLM responds with `{"reasoning": "...", "tags": [...]}`; the single `reasoning` string is persisted only to the deepest (leaf) tag of each newly-created path, while auto-created ancestors keep `reasoning=NULL`. Newly-suggested paths are inserted with `source='llm'` / `status='unconfirmed'`; reused existing tags keep their existing source/status/reasoning (ON CONFLICT preserves them). Upon completion the endpoint sets `ai_evaluated` to the current Unix epoch timestamp on the transaction.
  - **Historical RAG Context:** Before calling the LLM, the endpoint queries D1 for historical tag frequencies. It runs up to two queries: (1) all past transactions with the exact same `remittance_info` (description), and (2) all past transactions with the exact same `counterparty_name` (only if non-null/empty). For each match group it calculates the percentage of matching transactions that carry each non-rejected tag, and injects only tags with frequency strictly above 10% into the prompt (formatted as `"path (pct%)"`). The counterparty section is omitted entirely when there is no counterparty name. This lightweight RAG pattern helps the LLM strongly consider patterns from the user's own tagging history.
- **Batch Evaluation:** `POST /api/transactions/evaluate-batch` fetches up to 50 transactions where `ai_evaluated = 0`, ordered newest-first. For each transaction it performs the same historical RAG lookups as the single endpoint. All transaction metadata plus their individual RAG contexts are serialised into a single JSON array and sent to GLM-4.7-Flash in one prompt. The model must return a JSON array of `{"id": "<tx_id>", "reasoning": "...", "tags": [...]}` objects. Server-side filtering and leaf-consolidation logic (identical to the single endpoint) is applied per transaction. All 50 transactions are marked with the current Unix epoch timestamp in `ai_evaluated` regardless of whether the model assigned any tags. A companion endpoint `GET /api/transactions/pending-count` returns the current count of unevaluated transactions. The Homepage exposes an "Auto-Tag Pending (N)" button that calls the batch endpoint and refreshes the pending count.
- **`ai_evaluated` flag:** Integer column (`INTEGER DEFAULT 0`) on the `transactions` table tracking whether a transaction has been processed by the AI (single or batch). `0` means not yet evaluated; a non-zero value stores the Unix epoch timestamp when evaluation completed. Used to skip already-evaluated rows in batch runs and to surface the pending count in the UI.
- **Mocking:** When `ENVIRONMENT != 'production'` and the request carries `X-Test-Mock-AI: 1`, the endpoint returns a deterministic suggestion instead of calling the model. Production never honours the header.
- **Natural Language Querying (Two-Pass RAG):** `POST /api/chat` accepts a `{ question: string }` body and implements a two-pass AI flow using GLM-4.7-Flash:
  - **Pass 1 (Query Generation):** The system prompt injects the current date/time and the user's full tag taxonomy (confirmed + unconfirmed, excluding rejected). The LLM translates the natural language question into a JSON array of query objects (`{ tagGlobs, startDate?, endDate? }`) — the same shape consumed by the shared `executeTagQuery` utility in `functions/lib/query-utils.ts`.
  - **Execution:** The parsed query array is passed to `executeTagQuery`, which runs the GLOB/date SQL queries and returns matched transactions with income/expense aggregates.
  - **Pass 2 (Summarization):** A second LLM call receives the original question plus the aggregate numbers (transaction count, totalIncome, totalExpense) and generates a single friendly summary sentence.
  - **Response:** `{ summary, transactions, totalIncome, totalExpense }`.
  - **Mocking:** Same `X-Test-Mock-AI: 1` header pattern. Pass 1 returns a deterministic `food`/`food/*` query; Pass 2 returns a canned summary string. Production never honours the header.
  - **Frontend:** A chat input on the Homepage lets users ask questions. Results appear in a Card with the AI summary, income/expense totals, and an expandable transaction list.
- **UI:** The transaction modal exposes an `AI Evaluate` button. The `/tags` page lists Unconfirmed tags first, then Confirmed; clicking a tag shows linked transactions and offers Confirm / Reject / Edit-name actions, with a separate "View Rejected Tags" modal listing the per-user ban list.

## Environment Setup (Cloud Agents)

The Copilot Coding Agent environment is set up automatically via `.github/copilot-setup-steps.yml` before work starts (installs pnpm, npm deps, Terraform, Playwright browsers, generates dummy secrets, builds the project, and applies local DB migrations).

After setup, all checks and local E2E tests are available:

- **Static checks:** `pnpm check` (TypeScript + Terraform fmt/validate)
- **Build:** `pnpm build`
- **E2E tests locally:** start both dev servers in the background, then run tests:
  ```bash
  bash scripts/dev-server.sh > /tmp/dev-server.log 2>&1 & disown $!
  CI= pnpm test:e2e
  ```
  `CI=` must be unset so Playwright targets `localhost:8788` instead of the staging URL. `scripts/dev-server.sh` runs `pnpm dev` (Vite on :5173) and `pnpm dev:pages` (Wrangler on :8788) in parallel and exits with an error if either crashes.
  > ⚠️ If you added new DB migrations, run `pnpm migrate:local` before starting the dev servers or running tests.

## Validation Rules

After making any code changes, **always** run these checks before considering the task complete:

1. `pnpm check` — must pass (TypeScript + Terraform)
2. `pnpm build` — must succeed
3. Run the full E2E test suite locally (start dev servers → `CI= pnpm test:e2e`) — all tests must pass. If a test fails, investigate and fix before finishing.

## Cloud Agent (Copilot Coding Agent)

When you are the Copilot Coding Agent working on a feature branch, your final commit that completes the task MUST include `run-pipeline` in the commit message title to trigger the branch validation pipeline (check, build, deploy, E2E tests).
Then, after pushing, you MUST monitor the GitHub Actions pipeline for that commit. If any step fails (check/build/tests), you MUST investigate the failure, fix it in a new commit, and push again to re-trigger the pipeline until it fully passes.

## Final Notes

Personality: Don't flatter me. Be helpful but very honest. Don't agree with mistakes. Call out potential misses using ❗️.

Rules:
First get enough context from the user before implementation, nothing can be unclear. You must use the `askQuestions` tool until all missing info is clear and all decisions are locked in.
Focus on readability. Short simple solution > verbosity. If in doubt about a code decision => use the `askQuestions` tool.
Barely add comments, unless crucial for understanding, preferably inline

After completing every response, you MUST call the `vscode_askQuestions` tool with the following question:

```json
{
  "questions": [
    {
      "header": "",
      "question": "Anything else?",
      "allowFreeformInput": true,
      "multiSelect": false
    }
  ]
}
```

Do this at the end of every response, without exception.
