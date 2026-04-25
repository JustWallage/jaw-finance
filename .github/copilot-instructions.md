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
- **Frontend:** React, Vite, Tailwind CSS, Shadcn UI (must download components, not create them manually). Client-side routing via `react-router-dom` (`/` Home, `/tags` Tags) wrapped in a shared `Layout` with a bottom navigation bar.
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
- **Transaction Storage:** Transactions fetched from Enable Banking are cached in D1. Idempotent upserts using a UNIQUE constraint on `(entry_reference, account_uid)`.
- **Tagging System:** Hierarchical tags using a Materialized Path pattern.
  - `tags` table with `path` column (e.g., `food/groceries`). Many-to-many relationship via `transaction_tags` junction table.
  - Each tag row carries a `status` (`confirmed` | `unconfirmed` | `rejected`), a `source` (`system` | `user` | `llm`), and a nullable `reasoning` text column (a short dictionary-style definition of what the tag means). Manually created and system-generated tags default to `confirmed` with `reasoning=NULL`; LLM-suggested leaf tags are inserted as `unconfirmed` with the LLM's reasoning string. `rejected` tags are kept as a per-user ban list and excluded from default GETs.
  - Auto-tagging: Transactions are automatically tagged with `income`/`expense` and `year-YYYY/month-MM/day-DD` during ingestion (refresh and import). These are always `source='system'` and hidden from the Tags page.
  - Date tag format uses explicit prefixes (`year-2026/month-04/day-08`) to prevent wildcard search collisions across hierarchy levels.
  - Leaf Node Consolidation: Transactions are strictly linked to the deepest explicitly assigned node in a tag's lineage. Assigning a child tag automatically unlinks any ancestor tags from the transaction to prevent database and UI bloat, while all ancestor tags remain in the `tags` table for hierarchy queries.
  - Aggregation: `by-tags` endpoint (`POST /api/transactions/by-tags`) accepts a `queries` array of objects, each with optional `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), and required `tagGlobs` (string array). Multiple query objects are combined with OR logic. Tag matching uses SQLite's native `GLOB` operator directly against the `path` column — patterns like `vacation/*/food` or `home/*` are passed as-is. Date filtering applies `>=`/`<=` on `booking_date`. A legacy `paths` field is also accepted for backward compatibility (auto-converted to GLOB patterns matching exact path and children). The `/tags` page includes a "Query Tags" section with glob/date inputs and a results modal showing totals and matched transactions.
  - Frontend: `TagSelector` component per transaction row with inline creation, removal, deletion with confirmation. The dedicated `/tags` page splits user-domain tags (source != system) into Unconfirmed and Confirmed sections and exposes a Rejected Tags modal.
  - Rejection: setting `status='rejected'` via `PATCH /api/tags/:id` also deletes all `transaction_tags` rows for that tag, banning it from future LLM suggestions until un-rejected.
- **Mock State:** The Enable Banking mock uses the existing Staging/Local D1 database for state management. All mock-related tables are strictly prefixed with `mock_enable_banking_`.

## AI Integration

- **Provider:** Cloudflare Workers AI via `env.AI` binding (model: `@cf/meta/llama-3-8b-instruct`). The binding is declared in `wrangler.toml(.template)` under `[ai]` and is automatically provisioned by Cloudflare Pages — no Terraform changes are required.
- **On-Demand Evaluation:** `POST /api/transactions/:id/evaluate` builds a prompt from the transaction metadata, the tags already on the transaction (so the LLM doesn't re-suggest them or their parents), the user's reusable tag list (confirmed + unconfirmed) formatted as `"path (reasoning)"` when reasoning exists, and the user's rejected tag list. Surfacing each existing tag's reasoning to the LLM materially improves accuracy on subsequent evaluations. The LLM may reuse any number of existing tags and may also propose new paths even when an existing tag fits — server-side filters drop ancestors of any deeper suggested or already-assigned path, drop rejected paths and their descendants, and cap brand-new paths at 5 per call. The LLM responds with `{"reasoning": "...", "tags": [...]}`; the single `reasoning` string is persisted only to the deepest (leaf) tag of each newly-created path, while auto-created ancestors keep `reasoning=NULL`. Newly-suggested paths are inserted with `source='llm'` / `status='unconfirmed'`; reused existing tags keep their existing source/status/reasoning (ON CONFLICT preserves them).
- **Mocking:** When `ENVIRONMENT != 'production'` and the request carries `X-Test-Mock-AI: 1`, the endpoint returns a deterministic suggestion instead of calling the model. Production never honours the header.
- **UI:** The transaction modal exposes an `AI Evaluate` button. The `/tags` page lists Unconfirmed tags first, then Confirmed; clicking a tag shows linked transactions and offers Confirm / Reject / Edit-name actions, with a separate "View Rejected Tags" modal listing the per-user ban list.

## Environment Setup (Cloud Agents)

To set up the entire development environment from scratch (installs pnpm, npm deps, Terraform, Playwright browsers, generates dummy secrets, builds the project, and applies local DB migrations):

```bash
bash scripts/bootstrap.sh
```

After bootstrap, all checks and local E2E tests are available:
- **Static checks:** `pnpm check` (TypeScript + Terraform fmt/validate)
- **Build:** `pnpm build`
- **E2E tests locally:** start the dev server in the background, then run tests:
  ```bash
  bash scripts/dev-server.sh &
  sleep 5
  CI= pnpm test:e2e
  ```
  `CI=` must be unset so Playwright targets `localhost:8788` instead of the staging URL. The dev server serves the built `dist/` directory with Pages Functions and local D1.

## Validation Rules

After making any code changes, **always** run these checks before considering the task complete:
1. `pnpm check` — must pass (TypeScript + Terraform)
2. `pnpm build` — must succeed
3. Run the full E2E test suite locally (start dev server → `CI= pnpm test:e2e`) — all tests must pass. If a test fails, investigate and fix before finishing.

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
