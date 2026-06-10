# Project Context: jaw-finance Dashboard

Task one: you must keep this document up to date, but only with the broad context of the project. Do not include specific implementation details. Only when significant changes/additions to the project context/stack occur, you must update this document.

## Core Principles

1. **Production-Level Standards:** No hacks, no shortcuts. Built as an active company would build it.
2. **Simplicity:** Minimize dependencies, code, and steps. Do not reinvent the wheel.
3. **Fully Automated:** Zero manual deployments or UI configuration. Everything is managed via GitHub Actions (GHA) and Terraform.
4. **Trunk-Based Development:** Single `main` branch. Every push to `main` runs a gated pipeline: check/build → Terraform apply → ephemeral E2E environment → production deploy (see CI/CD below).

## Tech Stack

- **Project Name:** `jaw-finance`
- **Monorepo:** React UI in `/src`, API in `/functions`, IaC in `/iac`, Tests in `/tests`, Database schemas/types in `/db`.
- **Frontend:** React, Vite, Tailwind CSS, Shadcn UI (must download components, not create them manually). Client-side routing via `react-router-dom`: `/` (public landing page), `/terms`, `/privacy`, and a gated `/app` subtree (`AuthGate → ConsentGate → BankConnectionProvider → Layout`) with index `HomePage`, `/app/chat`, `/app/trends`, and `/app/settings`. `ConsentGate` enforces T&C/privacy consent before the app is usable.
- **Backend:** Cloudflare Pages Functions.
- **Database:** Cloudflare D1, provisioned via Terraform (production) and created per-run for E2E (see CI/CD).
  - Database bindings are dynamically templated into `wrangler.toml` during the CI pipeline (`wrangler.toml.template` → `wrangler.toml`).
  - D1 Migrations (in `db/migrations`) are automatically applied in the CI pipeline before each deployment. Configured via `migrations_dir = "db/migrations"` in wrangler configuration.
- **Package Manager:** pnpm.
- **CI/CD:** GitHub Actions.
- **E2E Testing:** Playwright.
- **IaC:** Terraform.
  - Cloudflare resources managed in `/iac` (state stored remotely in a Cloudflare R2 bucket).
  - The custom domain's DNS is managed in an external repo (CNAME to the Pages deployment).

## CI/CD Pipeline

Push to `main` triggers `deploy.yml`:

1. **Check & build** — TypeScript, Terraform fmt/validate, Vite build.
2. **Terraform apply** — reconciles Cloudflare resources (Pages project, D1, Access).
3. **Ephemeral E2E** (`ephemeral-e2e.yml`) — creates a throwaway D1 database (`ci-db-e2e-<run_id>`), renders `wrangler.toml` against it, runs migrations + merchant-pattern seeding, deploys the build to a per-run preview branch of the Pages project, runs the full Playwright suite against that live deployment, then tears the database down.
4. **Production deploy** (`deploy-prod.yml`) — only after E2E passes: migrations + seeding against the production D1, then the production Pages deployment. This is the only serialized (concurrency-gated) step.

Branch pipelines mirror this flow and are opt-in by including `run-pipeline` in the commit message title.

## Local Development

- **Frontend only:** `pnpm dev` (Vite dev server on port 5173).
- **Full stack (frontend + Pages Functions + D1):** `pnpm dev:pages` (runs `wrangler pages dev --proxy 5173`, which proxies Vite and serves Pages Functions locally with D1 bindings from `wrangler.toml`).
- **Local DB migrations:** `pnpm migrate:local` applies migrations to the local D1 database.
- **Local DB seeding:** `pnpm seed:local` syncs merchant patterns to the local D1 database.
- **Secrets in local dev:** Enable Banking credentials (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_SECRET`) go in a `.dev.vars` file at the project root (automatically loaded by wrangler). Set `VITE_DEV_USER_EMAIL` in `.env` (loaded by Vite).

## Security & Integrations

- **Authentication:** Cloudflare Access (Zero Trust) protects the application's API.
  - User identity is read from the `Cf-Access-Authenticated-User-Email` header (set automatically by Cloudflare Access in production). The Access policy is restricted to the owner's identities.
  - All DB records (`bank_connections`, `transactions`) are scoped to `user_email`.
  - In local dev, the frontend sends the header via `VITE_DEV_USER_EMAIL` (in `.env`).
- **Environment guard:** `ENVIRONMENT` is `local` / `staging` / `production`. Guards are fail-closed: `functions/lib/env.ts#isProduction` treats any unknown or unset environment as production. The entire mock subtree is blocked in production by a directory middleware.
- **Banking Integration:** Enable Banking (Open Banking / PSD2) via REST API.
  - JWT authentication: RS256, signed with a PEM private key.
  - OAuth-style redirect flow: `POST /auth` → bank redirect → callback with `code` → `POST /sessions`.
  - Configured dynamically per environment via `ENABLE_BANKING_API_URL` and `ENABLE_BANKING_CALLBACK_URL` environment variables.
  - **Mocking:** A controllable mock implementation exists in `/functions/mock-enable-banking/` for local development and E2E tests. It simulates the OAuth flow and returns deterministic data. It is strictly disabled in production (fail-closed middleware).
- **OAuth state:** The bank-redirect `state` parameter is HMAC-SHA256-signed (`functions/lib/oauth-state.ts`) with a `STATE_SECRET`, carries a nonce + issued-at timestamp, and expires after one hour. The callback rejects unsigned/expired state and cross-checks the Cloudflare Access identity header when present.
- **Rate limiting:** Expensive endpoints (AI chat, single/batch evaluation, bank authorization) enforce per-user fixed-window limits via a D1-backed `rate_limits` table (`functions/lib/rate-limit.ts`); no KV binding exists.
- **Error handling:** API routes never return upstream (Enable Banking / AI) error bodies or internal error messages to the client; details are logged server-side only.
- **Secrets:** GitHub Actions secrets are the source of truth. `STATE_SECRET` is synced to the production Pages environment via `wrangler pages secret put` during prod deploys; preview deployments receive `STATE_SECRET` and `TEST_AUTH_TOKEN` as templated vars in the rendered `wrangler.toml`. Locally, secrets live in `.dev.vars`.

## Data Management

- **Database Migrations:** Expand and Contract pattern. Migrations are in `/db/migrations` and run automatically before each deployment in the CI pipeline.
- **User Consent:** `user_consents` table stores GDPR/PSD2 consent records keyed by `user_email`. A global middleware (`functions/api/_middleware.ts`) intercepts all `/api/*` requests (excluding `/api/consent` and `/api/health`) and returns 403 if the user has not consented.
- **Transaction Storage:** Transactions fetched from Enable Banking are cached in D1. Idempotent upserts using a UNIQUE constraint on `(entry_reference, account_uid)`.
- **Tagging System:** Hierarchical tags using a Materialized Path pattern.
  - `tags` table with `path` column (e.g., `food/groceries`). Many-to-many relationship via `transaction_tags` junction table.
  - Each tag row carries a `status` (`confirmed` | `unconfirmed` | `rejected`), a `source` (`system` | `user` | `llm`), and a nullable `reasoning` text column (a short dictionary-style definition of what the tag means). Manually created and system-generated tags default to `confirmed` with `reasoning=NULL`; LLM-suggested leaf tags are inserted as `unconfirmed` with the LLM's reasoning string. `rejected` tags are kept as a per-user ban list and excluded from default GETs.
  - Ingestion does not auto-assign system flow/date tags. Queries and analytics for income/expense rely on transaction fields (`credit_debit`, `booking_date`) rather than implicit system tags.
  - Leaf Node Consolidation: Transactions are strictly linked to the deepest explicitly assigned node in a tag's lineage. Assigning a child tag automatically unlinks any ancestor tags from the transaction, while all ancestor tags remain in the `tags` table for hierarchy queries.
  - Aggregation: `by-tags` endpoint (`POST /api/transactions/by-tags`) accepts a `queries` array of objects, each with optional `startDate` / `endDate` (YYYY-MM-DD) and required `tagGlobs` (string array). Multiple query objects are combined with OR logic. Tag matching uses SQLite's native `GLOB` operator against the `path` column. Date filtering applies `>=`/`<=` on `booking_date`.
- **Merchant Pattern Dictionary:** A global `global_merchant_patterns` table stores GLOB patterns mapped to tag paths (JSON array). During transaction ingestion, each new transaction is matched against patterns (first `remittance_info`, then `counterparty_name`) and auto-tagged with `source='system'`/`status='confirmed'`. A `merchant_db_evaluated` integer column (epoch timestamp, default 0) on `transactions` tracks whether a transaction has been evaluated against the dictionary. This is independent of `ai_evaluated` — both enrichment layers run separately.
  - **Seeding:** Patterns live in `db/seeds/global_merchant_patterns.json`; `scripts/seed-merchant-patterns.mjs` syncs them to D1 (diffing inserts/updates/deletes). CI runs seeding after migrations. Locally: `pnpm seed:local`.
  - **Endpoints:** `POST /api/transactions/evaluate-merchant-pending` (evaluates rows where `merchant_db_evaluated = 0`), `POST /api/transactions/evaluate-merchant-all-force` (re-evaluates all). The `/app/settings` page exposes both as buttons under a "Merchant Dictionary" card.
- **Mock State:** The Enable Banking mock uses the existing non-production D1 database for state management. All mock-related tables are strictly prefixed with `mock_enable_banking_`.

## AI Integration

- **Provider:** Cloudflare Workers AI via `env.AI` binding (model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). The binding is declared in `wrangler.toml(.template)` under `[ai]` and is automatically provisioned by Cloudflare Pages — no Terraform changes are required.
- **On-Demand Evaluation:** `POST /api/transactions/:id/evaluate` builds a prompt from the transaction metadata, an optional user-provided `explanation` of the transaction, the tags already on the transaction, the user's reusable tag list (confirmed + unconfirmed) formatted as `"path (reasoning)"` when reasoning exists, and the user's rejected tag list. The LLM may reuse existing tags or propose new paths — server-side filters drop ancestors of any deeper suggested or already-assigned path, drop rejected paths and their descendants, and cap brand-new paths at 5 per call. The LLM responds with `{"reasoning": "...", "tags": [...]}`; the reasoning string is persisted only to the deepest (leaf) tag of each newly-created path. Newly-suggested paths are inserted with `source='llm'` / `status='unconfirmed'`; reused existing tags keep their existing source/status/reasoning. Upon completion the endpoint sets `ai_evaluated` to the current Unix epoch timestamp on the transaction.
  - **Historical RAG Context:** Before calling the LLM, the endpoint queries D1 for historical tag frequencies: (1) all past transactions with the exact same `remittance_info`, and (2) all past transactions with the exact same `counterparty_name` (only if non-null/empty). For each match group it calculates the percentage of matching transactions that carry each non-rejected tag, and injects only tags with frequency strictly above 10% into the prompt (formatted as `"path (pct%)"`). This lightweight frequency-based RAG pattern (no vector DB) steers the LLM toward the user's own tagging history.
- **Batch Evaluation:** `POST /api/transactions/evaluate-batch` fetches a batch of transactions where `ai_evaluated = 0` (currently 15 per call), ordered newest-first, performs the same RAG lookups per transaction, and sends everything in one prompt. The model returns a JSON array of `{"id", "reasoning", "tags"}` objects; the same server-side filtering and leaf-consolidation logic applies per transaction. All batch transactions are marked evaluated regardless of whether the model assigned tags. A companion endpoint `GET /api/transactions/pending-count` returns the count of unevaluated transactions. The Homepage exposes an "Auto-Tag Pending (N)" button.
- **Ambiguous transactions:** `GET /api/transactions/ambiguous` (+ `ambiguous-count`) lists recent transactions with no tags at all, so the user can explain them in natural language and trigger an AI evaluation with that explanation.
- **`ai_evaluated` flag:** Integer column (`INTEGER DEFAULT 0`) on `transactions` tracking AI processing. `0` = not yet evaluated; non-zero = Unix epoch timestamp of evaluation.
- **Mocking:** In non-production environments the AI endpoints support a deterministic mock mode for E2E tests (header-gated, fail-closed in production).
- **Natural Language Querying (Two-Pass RAG):** `POST /api/chat` accepts `{ question: string }` and runs a two-pass flow:
  - **Pass 1 (Query Generation):** The system prompt injects the current date/time and the user's tag taxonomy. The LLM translates the question into a JSON array of query objects (`{ tagGlobs, startDate?, endDate? }`) — the same shape consumed by the shared `executeTagQuery` utility in `functions/lib/query-utils.ts`.
  - **Execution:** The query array is executed as deterministic GLOB/date SQL — the LLM never does the money math.
  - **Pass 2 (Summarization):** A second LLM call receives the question plus the aggregates and generates a friendly summary sentence.
  - **Response:** `{ summary, transactions, totalIncome, totalExpense, byPath }`.
  - **Frontend:** The `/app/chat` page lets users ask questions; results show the AI summary, income/expense totals, and an expandable transaction list.
- **UI:** The transaction modal exposes an `AI Evaluate` button. The `/app/trends` page lists Unconfirmed tags first, then Confirmed; clicking a tag shows linked transactions and offers Confirm / Reject / Edit-name actions, with a separate "View Rejected Tags" modal.

## Validation Rules

After making any code changes, **always** run these checks before considering the task complete:

1. `pnpm check` — must pass (TypeScript + Terraform + unit tests)
2. `pnpm build` — must succeed
3. Run the full E2E test suite locally (start dev servers → `pnpm test:e2e`) — all tests must pass. If a test fails, investigate and fix before finishing.

Unit tests (vitest) live next to the code they test (`functions/**/*.test.ts`) and run via `pnpm test:unit`.

In E2E tests, Playwright authenticates via test fixtures in `tests/fixtures.ts`; CI targets the ephemeral deployment, local runs target `localhost:8788`. If you added new DB migrations, run `pnpm migrate:local` before starting the dev servers or running tests.

## Final Notes

Rules:
First get enough context from the user before implementation, nothing can be unclear.
Focus on readability. Short simple solution > verbosity.
Don't add comments, unless absolutely crucial for understanding, preferably inline.
