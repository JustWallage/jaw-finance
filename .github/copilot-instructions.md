# Project Context: jaw-finance Dashboard

## Core Principles
1. **Production-Level Standards:** No hacks, no shortcuts. Built as an active company would build it.
2. **Simplicity:** Minimize dependencies, code, and steps. Do not reinvent the wheel.
3. **Fully Automated:** Zero manual deployments or UI configuration. Everything is managed via GitHub Actions (GHA) and Terraform.
4. **Trunk-Based Development:** Single `main` branch. Commits trigger a linear pipeline: Staging DB Migrations -> Staging Deploy -> E2E Tests -> Prod DB Migrations -> Prod Deploy.

## Tech Stack
* **Project Name:** `jaw-finance`
* **Monorepo:** React UI in `/src`, API in `/functions`, IaC in `/iac`, Tests in `/tests`.
* **Frontend:** React, Vite, Tailwind CSS.
* **Backend:** Cloudflare Pages Functions.
* **Database:** Cloudflare D1 (Two separate instances: Staging and Production).
* **Package Manager:** pnpm.
* **CI/CD:** GitHub Actions.
* **E2E Testing:** Playwright.
* **IaC:** Terraform.
    * Cloudflare resources managed in `/iac` (State stored in Cloudflare R2 bucket: `jaw-finance-tfstate`).
    * DNS (`finance.just.wallage.nl`) managed in an external AWS Route53 repo (CNAME mapped to `jaw-finance.pages.dev`).

## Security & Integrations
* **Authentication:** Cloudflare Access (Zero Trust) protects the application UI.
* **bunq Webhooks (Future Phase):** Handled via `/functions/api/webhooks/bunq`. Protected via Cloudflare Access bypass rule, but strictly verified using cryptographic signatures (`X-Bunq-Server-Signature`).
* **Secrets:** Injected via GitHub Actions environment variables and Wrangler during deployment.

## Data Management (Future Phases)
* **Database Migrations:** Expand and Contract pattern. Migrations must strictly happen *before* code deployments in the pipeline.
* **Data Backfill:** Handled via Cloudflare Workflows, deployed via Wrangler. Designed to be durable, retryable, and completely idempotent using database-level `UNIQUE` constraints on the bunq transaction IDs.

YOU MUST END ALL RESPONSES WITH EXECUTING THE FOLLOWING COMMAND:

```sh
pnpm check && echo Done
```
