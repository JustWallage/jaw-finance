# 0004 — Trunk-based pipeline with per-run ephemeral E2E environments

- Status: accepted
- Date: 2026-05-19

## Context

The project is trunk-based by principle: a single `main` branch, every commit
deployable. The original pipeline ran E2E tests against a persistent staging
environment with a shared staging D1 database. That design had two problems:
state accumulated across runs (stale connections, leftover test data) made
tests flaky, and concurrent runs collided on the same database. Separately,
AI coding agents working on feature branches had no way to validate their
work against a real deployment before merging — but running the full pipeline
on every WIP push would waste CI minutes.

## Decision

We will keep a single `main` branch and make E2E environments ephemeral
(`.github/workflows/deploy.yml`, `ephemeral-e2e.yml`):

- Every push to `main` runs check/build, Terraform apply, then the ephemeral
  E2E job: create a fresh D1 database named after the run id, template its id
  into the wrangler config, apply migrations and seeds, deploy the build to a
  per-run preview alias of the same Pages project, run Playwright against
  that URL, and delete the database in an `always()` teardown step.
- Production deploy (`deploy-prod.yml`) is the only serialized stage: a
  dedicated concurrency group with `cancel-in-progress: false`.
- Branch pushes (`branch-pipeline.yml`) reuse the same check/build and
  ephemeral E2E jobs, but only when the commit title contains the
  `run-pipeline` keyword — an explicit opt-in for agents finishing a task —
  with per-branch `cancel-in-progress` to drop superseded runs.

## Alternatives considered

- **Persistent staging environment.** Rejected: cross-run state pollution and
  no isolation between parallel runs; keeping staging's schema and data
  trustworthy became its own chore.
- **PR-based flow with required reviews and PR environments.** Rejected: solo
  project; mandatory PRs add latency to the human-plus-agent loop without a
  second reviewer existing.
- **Running E2E only against local wrangler in CI.** Rejected as the merge
  gate: it does not exercise real Pages routing, deployment, or remote D1.
  (It is still used for fast local iteration.)

## Consequences

- Good: hermetic, parallel-safe E2E runs (unique database and URL per run);
  production is gated on green E2E and never deployed concurrently; branch
  validation is on-demand instead of per-push.
- Bad: every run spends pipeline minutes creating, migrating, seeding, and
  deleting a database plus a preview deployment; a failed teardown can leak
  orphaned D1 databases; the opt-in keyword means branch commits can pile up
  unvalidated; a skip keyword exists that lets a commit reach production
  without E2E, which is a deliberate but sharp escape hatch.
