You said
# Project Context: jaw-finance Dashboard

Task one: you must keep this document up to date, but only with the broad context of the project. Do not include specific implementation details. Only when significant changes/additions to the project context/stack occur, you must update this document.

## Core Principles
1. **Production-Level Standards:** No hacks, no shortcuts. Built as an active company would build it.
2. **Simplicity:** Minimize dependencies, code, and steps. Do not reinvent the wheel.
3. **Fully Automated:** Zero manual deployments or UI configuration. Everything is managed via GitHub Actions (GHA) and Terraform.
4. **Trunk-Based Development:** Single `main` branch. Commits trigger a linear pipeline: Staging DB Migrations -> Staging Deploy -> E2E Tests -> Prod DB Migrations -> Prod Deploy.

## Tech Stack
* **Project Name:** `jaw-finance`
* **Monorepo:** React UI in `/src`, API in `/functions`, IaC in `/iac`, Tests in `/tests`.
* **Frontend:** React, Vite, Tailwind CSS, Shadcn UI (must download components, not create them manually).
* **Backend:** Cloudflare Pages Functions.
* **Database:** Cloudflare D1 (Two separate instances: Staging and Production), provisioned via Terraform.
* Database bindings are dynamically templated into `wrangler.toml` during the CI pipeline using Terraform outputs (`wrangler.toml.template` → `wrangler.toml`).
* D1 Migrations (in `/migrations`) are automatically applied in the CI pipeline before each environment's code deployment.
* **Package Manager:** pnpm.
* **CI/CD:** GitHub Actions.
* **E2E Testing:** Playwright.
* **IaC:** Terraform.
* Cloudflare resources managed in `/iac` (State stored in Cloudflare R2 bucket: `jaw-finance-tfstate`).
* DNS (`finance.just.wallage.nl`) managed in an external AWS Route53 repo (CNAME mapped to `jaw-finance.pages.dev`).

## Security & Integrations
* **Authentication:** Cloudflare Access (Zero Trust) protects the application UI.
* **Banking Integration:** Enable Banking (Open Banking / PSD2) via REST API at `https://api.enablebanking.com`.
* JWT authentication: RS256 with `ENABLE_BANKING_APP_ID` as `kid` and `ENABLE_BANKING_SECRET` (PEM private key) for signing.
* OAuth-style redirect flow: `POST /auth` → bank redirect → callback with `code` → `POST /sessions`.
* Callback URL: `https://finance.just.wallage.nl/api/bank/callback`.
* **Secrets:** Pages Function secrets set via `wrangler pages secret put` in CI. Uses Cloudflare's secrets API (persists across deployments). GitHub Actions secrets are the source of truth.

## Data Management
* **Database Migrations:** Expand and Contract pattern. Migrations are in `/migrations` and run automatically before each environment's code deployment in the CI pipeline.
* **Transaction Storage:** Transactions fetched from Enable Banking are cached in D1. Idempotent upserts using a UNIQUE constraint on `(entry_reference, account_uid)`.

You are a professional prompt writer. Your task is to write a prompt based on the input below. The prompt will then be given to an AI agent (let's call it J2) running in the repo that contains the code. You can assume that J2 is competent in writing code, and has full access to the existing code and is able to fit the new code into the existing codebase. J2 does not need any additional info (like the context) of the repo since it already has that. Your goal is to get enough context from the user to write the full prompt, nothing can be still unclear. If anything is unclear or yet undecided, you MAY NOT WRITE THE PROMPT yet. Instead you must first continue asking the user for the missing pieces required for your prompt. Writing the prompt consists of a discussion between you and the user to lock in the decisions before writing.
Additional rules:
- when significant changes/additions to the project context/stack occur, you must update the context document, context is written out in .github/copilot-instructions.md.
- Any change that involves added/changed funcionality must include e2e tests
Here is the user's request:

Create a custom enablebanking mock implementation that can be used for both local development and during the test phase in the pipeline. It must therefore also be possible to set the enable banking endpoint via an env variable in the pages function, and the callback url. Also I the pipeline the deployment to test should be done with separate env vars (so that the mock implementation can be used). Is it possible to create the mock enable banking implementation in a pages function itself as well so that that can be used for the staging environment. And also, if possible, I want to run that same enable banking mock pages function locally (like I'm already doing with the api, I'm running the api function locally usingL "dev:pages": "wrangler d1 migrations apply jaw-finance-local --local && wrangler pages dev --proxy 5173",
Gemini said
This is a fantastic initiative. Implementing a dedicated, controllable mock for the Enable Banking API is exactly the kind of production-level standard we want. It will make your E2E tests deterministic and your local development completely independent of the actual third-party service.

However, before I can write a comprehensive and bulletproof prompt for J2, we need to lock down a few architectural decisions. Since Cloudflare Pages Functions are stateless and the Enable Banking flow involves multi-step OAuth-style redirects, we need to figure out exactly how this mock will operate.

Here are the key points we need to decide on:

1. Mock Architecture & Deployment

You asked if the mock could be a Pages Function itself and run locally via your existing dev:pages setup. We have two main ways to do this:

Option A (Integrated Routes - Recommended for simplicity): We build the mock into the existing jaw-finance API under a specific path, like /functions/mock-bank/.

Pros: Runs instantly with your existing dev:pages command. No new Terraform resources needed. Deploys seamlessly alongside your staging API.

Cons: It technically deploys to production as well. We would need to add an environment variable (e.g., MOCK_ENABLED=true) to strictly block these routes in production.

Option B (Separate Project): We create a completely separate Cloudflare Pages project for the mock.

Pros: Complete separation of concerns. Never touches production.

Cons: Requires updating Terraform to provision a new Pages project and domain, setting up a new GHA pipeline for it, and running a second wrangler pages dev process locally.

2. State Management

The Enable Banking flow requires generating a code via a redirect, which is then exchanged for a session. Because Cloudflare Pages Functions are stateless (serverless edge workers), they forget everything between requests.

How should the mock handle this state? Do you want it to be entirely static/stateless (e.g., any code sent to the token endpoint returns a successful mock session, and fetching transactions always returns a hardcoded JSON array)?

Or do you want it to be stateful (storing the temporary code and dynamic mock transactions in your existing Staging/Local D1 database) so Playwright can test different scenarios (e.g., success, insufficient funds, expired tokens)?

3. Environment Variables Configuration

To make this work seamlessly across environments, I propose we introduce the following environment variables. Do these look good to you?

ENABLE_BANKING_API_URL:

Local: http://localhost:8788/mock-bank (or whatever local port it runs on)

Staging: https://finance.just.wallage.nl/mock-bank

Production: https://api.enablebanking.com

ENABLE_BANKING_CALLBACK_URL:

Local: http://localhost:5173/api/bank/callback

Staging: https://finance.just.wallage.nl/api/bank/callback

Production: https://finance.just.wallage.nl/api/bank/callback

4. E2E Test Scenarios

Since any new functionality requires E2E tests, Playwright will now interact with this mock during the staging pipeline. What specific user journeys should the E2E tests cover regarding the banking integration? (e.g., "User connects bank successfully and sees transactions," "User cancels bank connection mid-redirect").

Would you like to go with Option A for the architecture, and keep the mock stateless/hardcoded to start, or did you have a different approach in mind? Once we nail these down, I'll update the project context and write the prompt for J2!

You said
1. can we do it in a separate function but in the same project. So not a new Cloudflare pages project, but just a new function in this project. Is this possible? Can the other function talk with this one?

2. Do it in the existing staging/local d1 db. Every table that is related to this state must start with mock-enable-banking-

3. staging: https://finance.just.wallage.nl/mock-enable-banking
Other values are correct. Make sure that j2 implements these env vars for the api's

4. yes test 1 sounds nice. Also, a question, how will the mock page for logging in work? When I click the real connect button it redirects me to an enable banking page, how will this work for the mock one? Should I create a webpage somewhere? Will the API endpoint return a html with a button like "Connect", "Simulate cancel", "Simulate failure" or something? Where does this UI live?
Gemini said
Great choices. We are really zeroing in on a robust, production-grade testing setup. Let’s break down how this will work based on your decisions:

1. Separate Function / Same Project

Yes, this is completely possible and very standard. Cloudflare Pages actually compiles your entire functions/ directory into a single serverless worker behind the scenes, routing requests based on the folder structure.

We will create a new directory: functions/mock-enable-banking/.

Your main API will communicate with this mock exactly like it would with a third-party service: via standard HTTP fetch requests using the URL defined in your ENABLE_BANKING_API_URL environment variable. It won't even know it's talking to a function in the same codebase.

2. D1 State Management

Perfect. We will instruct J2 to create a new migration file in /migrations specifically for the mock tables.

Example tables: mock-enable-banking-sessions, mock-enable-banking-auth-codes.

J2 will configure the mock function to read/write to these tables to validate authorization codes and simulate a stateful OAuth flow.

3. Environment Variables

Locked in. J2 will be instructed to wire up the API to respect these exact variables:

API URL: https://finance.just.wallage.nl/mock-enable-banking (Staging), http://localhost:8788/mock-enable-banking (Local), and the real URL for Prod.

Callback URL: https://finance.just.wallage.nl/api/bank/callback (Staging/Prod), http://localhost:5173/api/bank/callback (Local).

4. The Mock UI

This is an excellent question. You do not need to build a new React page for this.
Because Cloudflare Pages Functions can return any content type, the mock authorization endpoint (e.g., GET /mock-enable-banking/auth) will simply return a raw HTML string.

Here is how the flow will look:

User clicks "Connect Bank" in your React UI.

Your API generates a redirect URL to the Enable Banking authorization endpoint (which is currently mapped to our mock).

The browser redirects to /mock-enable-banking/auth.

The mock function returns a basic HTML page with inline CSS. It will literally just be a white page with three big HTML buttons: "Simulate Success", "Simulate Cancel", and "Simulate Failure".

When Playwright (or you) clicks "Simulate Success", the HTML page triggers a redirect back to your ENABLE_BANKING_CALLBACK_URL with a generated code=xyz in the query parameters, perfectly mimicking the real bank.

This gives us a complete, end-to-end stateful testing environment.

Are you ready for me to generate the final, comprehensive prompt for J2 and the exact updates to make to your .github/copilot-instructions.md context document, or is there anything else regarding the mock behavior you'd like to tweak first?

You said
I'm ready
Gemini said
Here are the updates for your context document and the final, comprehensive prompt to feed to J2.

Part 1: Updates to .github/copilot-instructions.md

Replace your existing ## Security & Integrations and ## Data Management sections with the following updated text to reflect the new architecture:

Markdown
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
Part 2: Prompt for J2

Copy and paste the block below directly to J2. It contains all the necessary constraints and context to build the feature exactly as we discussed.

Prompt for J2:

We need to implement a production-grade, stateful mock for the Enable Banking API to be used in our local environment and staging pipeline. This will allow our Playwright E2E tests to run deterministically without hitting the real third-party API.

Please implement the following:

1. Environment Variables & Main API Updates
Update the existing bank API integration (/functions/api/...) to no longer hardcode the Enable Banking URLs.

Introduce ENABLE_BANKING_API_URL and ENABLE_BANKING_CALLBACK_URL.

Ensure these variables are properly typed and accessed via the Cloudflare Pages env object.

Update our wrangler.toml (and wrangler.toml.template if applicable) to include placeholder or local values for these.

2. Database Migrations for Mock State
Create a new SQL migration file in /migrations/ for the mock state.

Create tables required to manage the OAuth flow state (e.g., storing temporary auth codes before they are exchanged for sessions).

Crucial: All mock-related tables MUST be prefixed with mock_enable_banking_ (e.g., mock_enable_banking_auth_codes, mock_enable_banking_sessions).

3. The Mock Implementation (/functions/mock-enable-banking/)
Create the mock endpoints inside a new /functions/mock-enable-banking/ directory. Because Pages compiles the whole functions/ folder, add a strict guard at the top of these mock routes to return a 404 Not Found if the ENVIRONMENT env var equals production.

The mock needs to handle the following standard Enable Banking flow:

The Auth Endpoint: When the frontend redirects the user here, return a raw HTML string (using standard Response with Content-Type: text/html). Do not build a React page. The HTML should be a simple interface containing three interactive <button> elements or links: "Simulate Success", "Simulate Cancel", and "Simulate Failure".

Success Flow: When "Simulate Success" is clicked, generate a random code, save it to the mock_enable_banking_ D1 tables, and redirect the browser back to the ENABLE_BANKING_CALLBACK_URL with the code in the query params.

Sessions/Token Endpoint: Accept the code, validate it against the D1 table, and return a mock session/JWT.

Transactions Endpoint: Return a hardcoded JSON array of mock transactions that matches the schema of the real Enable Banking API.

4. E2E Tests
Add a new Playwright E2E test in /tests/ that covers the "User connects bank successfully" journey.

The test should click the "Connect Bank" button in our React UI.

Wait for the redirect to our raw HTML mock page.

Click the "Simulate Success" button.

Verify that the app successfully redirects back to the callback, processes the code, and ultimately displays the mocked transactions in the UI.