# 0002 — Build the entire stack on Cloudflare (Pages + D1 + Workers AI)

- Status: accepted
- Date: 2026-03-10

## Context

jaw-finance is a solo-built personal finance dashboard held to production
standards: fully automated deployments (Terraform + GitHub Actions), no manual
UI configuration, and near-zero running cost. It needs static hosting for a
React UI, an HTTP API, a relational store for transactions and tags,
authentication, and LLM inference for transaction tagging and natural-language
querying. A prior-art survey (`docs/research/existing-services.md`) showed the
AI-querying features we wanted exist mainly in paid SaaS apps; building
in-house was also an explicit goal of the project.

## Decision

We will run everything on Cloudflare: Pages serves the React build and hosts
the API as Pages Functions in the same project; D1 (SQLite) provides separate
staging and production databases provisioned via Terraform; Zero Trust Access
handles authentication in front of the app; Workers AI (the `env.AI` binding)
provides LLM inference. Compute, database, and AI are co-located on one
platform and managed by a single Terraform provider.

## Alternatives considered

- **Node server + Postgres (VPS/Fly/Render + RDS/Neon).** Rejected: standing
  infrastructure to patch, monitor, and pay for; conflicts with the zero-ops,
  near-zero-cost goals.
- **AWS serverless (Lambda + API Gateway + Aurora).** Rejected: far more IaC
  surface and billing complexity for the same outcome.
- **Managed LLM APIs (OpenAI/Anthropic) alongside the app.** Rejected: a
  second vendor, API-key management, and per-token billing; Workers AI is
  already bound to the runtime with no extra credentials.
- **Self-hosting an existing tool (e.g. Firefly III) or paying for a SaaS
  app.** Rejected: the project is a portfolio/learning vehicle, and the
  surveyed apps don't combine EU PSD2 data access with the custom AI tagging
  flow we wanted.

## Consequences

- Good: no servers, free-tier-friendly, single provider in Terraform, and
  Pages preview deployments come built in — which later enabled the ephemeral
  E2E pipeline (ADR 0004). API code, SQLite, and the model run next to each
  other, so per-request RAG queries are cheap.
- Bad: deep vendor lock-in — Pages Functions signatures, D1 bindings, and
  Access identity headers are all Cloudflare-specific. D1 is SQLite with
  platform limits; a migration already had to be reworked for D1
  compatibility (GLOB behaviour, migration 0020). Workers AI restricts model
  choice to its catalogue (GLM-4.7-Flash was picked from what is available,
  not from the open market). Local development depends on wrangler's
  emulation of all of the above.
