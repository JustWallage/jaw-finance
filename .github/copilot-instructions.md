# Project Context: jaw-finance Dashboard

Task one: you must keep this document up to date, but only with the broad context of the project. Do not include specific implementation details. Only when significant changes/additions to the project context/stack occur, you must update this document.

## Core Principles
1. **Production-Level Standards:** No hacks, no shortcuts. Built as an active company would build it.
2. **Simplicity:** Minimize dependencies, code, and steps. Do not reinvent the wheel.
3. **Fully Automated:** Zero manual deployments or UI configuration. Everything is managed via GitHub Actions (GHA) and Terraform.
4. **Trunk-Based Development:** Single `main` branch. Commits trigger a linear pipeline: Staging DB Migrations -> Staging Deploy -> E2E Tests -> Prod DB Migrations -> Prod Deploy.

## Tech Stack
* **Project Name:** `jaw-finance`
* **Monorepo:** React UI in `/src`, API in `/functions`, IaC in `/iac`, Tests in `/tests`, Database schemas/types in `/db`.
* **Frontend:** React, Vite, Tailwind CSS, Shadcn UI (must download components, not create them manually).
* **Backend:** Cloudflare Pages Functions.
* **Database:** Cloudflare D1 (Two separate instances: Staging and Production), provisioned via Terraform.
  * Database bindings are dynamically templated into `wrangler.toml` during the CI pipeline using Terraform outputs (`wrangler.toml.template` → `wrangler.toml`).
  * D1 Migrations (in `db/migrations`) are automatically applied in the CI pipeline before each environment's code deployment. Configured via `migrations_dir = "db/migrations"` in wrangler configuration.
* **Package Manager:** pnpm.
* **CI/CD:** GitHub Actions.
* **E2E Testing:** Playwright.
* **IaC:** Terraform.
    * Cloudflare resources managed in `/iac` (State stored in Cloudflare R2 bucket: `jaw-finance-tfstate`).
    * DNS (`finance.just.wallage.nl`) managed in an external AWS Route53 repo (CNAME mapped to `jaw-finance.pages.dev`).

## Local Development
* **Frontend only:** `pnpm dev` (Vite dev server on port 5173).
* **Full stack (frontend + Pages Functions + D1):** `pnpm dev:pages` (runs `wrangler pages dev --proxy 5173`, which proxies Vite and serves Pages Functions locally with D1 bindings from `wrangler.toml`).
* **Local DB migrations:** `pnpm migrate:local` applies migrations to the local D1 database.
* **Secrets in local dev:** Set `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_SECRET` in a `.dev.vars` file at the project root (automatically loaded by wrangler).

## Security & Integrations
* **Authentication:** Cloudflare Access (Zero Trust) protects the application UI.
* **Banking Integration:** Enable Banking (Open Banking / PSD2) via REST API.
  * JWT authentication: RS256 with `ENABLE_BANKING_APP_ID` as `kid` and `ENABLE_BANKING_SECRET` (PEM private key) for signing.
  * OAuth-style redirect flow: `POST /auth` → bank redirect → callback with `code` → `POST /sessions`.
  * Configured dynamically per environment via `ENABLE_BANKING_API_URL` and `ENABLE_BANKING_CALLBACK_URL` environment variables.
  * **Mocking:** A controllable mock implementation exists in `/functions/mock-enable-banking/` for local development and staging E2E tests. It simulates the OAuth flow and returns deterministic data. It must be strictly disabled in production via environment checks.
* **Secrets:** Pages Function secrets set via `wrangler pages secret put` in CI. Uses Cloudflare's secrets API (persists across deployments). GitHub Actions secrets are the source of truth.

## Data Management
* **Database Migrations:** Expand and Contract pattern. Migrations are in `/migrations` and run automatically before each environment's code deployment in the CI pipeline.
* **Transaction Storage:** Transactions fetched from Enable Banking are cached in D1. Idempotent upserts using a UNIQUE constraint on `(entry_reference, account_uid)`.
* **Mock State:** The Enable Banking mock uses the existing Staging/Local D1 database for state management. All mock-related tables are strictly prefixed with `mock_enable_banking_`.

Your goal is to get enough context from the user before implementation, nothing can be still unclear. If anything is unclear or yet undecided you must use the `askQuestions` tool to confirm the missing pieces.

YOU MUST END ALL RESPONSES WITH EXECUTING THE FOLLOWING COMMAND:

```sh
pnpm check && echo Done
```
