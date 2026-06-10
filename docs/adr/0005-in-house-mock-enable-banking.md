# 0005 — In-house stateful Enable Banking mock as a same-project Pages Function

- Status: accepted
- Date: 2026-03-30

## Context

E2E tests and local development must not depend on the real Enable Banking
API: real bank authorization needs a human in the loop, third-party sandbox
data is nondeterministic, and tests would inherit external availability and
rate limits. The OAuth-redirect shape of the integration (ADR 0003) makes the
provider mockable behind the same per-environment base-URL variable the API
already uses.

Two architectures were debated (recorded in a design chat transcript, since
deleted):

- **Option A — integrated routes in the same Pages project.** Runs under the
  existing local dev command, deploys alongside the app, no new Terraform
  resources. Downside: the mock code technically ships to production and must
  be blocked there.
- **Option B — a separate Cloudflare Pages project.** Clean separation, never
  touches production. Downside: a new Terraform-provisioned project and
  domain, a second deploy pipeline, and a second wrangler process locally.

The same debate settled two more points: the mock should be *stateful*
(backed by D1, so the multi-step OAuth flow and varied scenarios can be
simulated) rather than static hardcoded responses, and the mock's
authorization page should be a raw HTML page served by the function itself —
with "Simulate Success" / "Simulate Cancel" / "Simulate Failure" buttons —
not a React page.

## Decision

We will implement the mock as routes inside `functions/mock-enable-banking/`
in the same Pages project. The main API reaches it through the same
environment-variable-configured base URL it uses for the real API, so the
API code path is identical against mock and real provider. Mock state lives
in the shared local/staging D1 database in tables strictly prefixed
`mock_enable_banking_`. A directory-level middleware
(`functions/mock-enable-banking/_middleware.ts`) fails closed: unless the
environment is explicitly non-production, the entire subtree returns 404.

## Alternatives considered

- **Separate Pages project (Option B).** Rejected: extra Terraform, a second
  pipeline, and a second local process bought only isolation that an
  environment guard provides more cheaply.
- **Static/stateless mock.** Rejected: cannot validate the code-for-session
  exchange or exercise failure scenarios; storing auth codes in D1 lets the
  mock mimic the real flow end to end.
- **Network-level mocking in Playwright (route interception).** Rejected: it
  would only cover tests, not local development, and would bypass the real
  server-side fetch path being verified.

## Consequences

- Good: deterministic E2E with zero third-party calls; the mock runs
  identically locally and in CI because it is the same deployed code;
  Playwright drives the full redirect journey through real browser
  navigation; one deploy artifact, no extra infrastructure.
- Bad: the mock can drift from the real Enable Banking API — schema or flow
  changes upstream surface only in production use, since E2E never touches
  the real provider; mock code is present in the production bundle (guarded,
  but present); mock tables share the staging database with real staging
  data.
