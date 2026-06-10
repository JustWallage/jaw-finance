# 0003 — Use the Enable Banking PSD2 aggregator instead of bunq's direct API

- Status: accepted
- Date: 2026-03-23

## Context

The first banking integration (March 2026) was bunq's direct API. The git
history shows what that required:

- a device/installation registration ceremony run offline via a Python
  bootstrap script (`scripts/bunq-auth/setup_context.py`) that extracted
  cryptographic material into GitHub Secrets
- per-request RSA body signing and a set of custom bunq headers
- a `bunq_session_cache` D1 table (migration 0001) because session creation
  was too expensive to do per request
- IP-bound API keys, which sit badly with Pages Functions egressing from
  changing Cloudflare IPs (a follow-up commit added "dynamic IP fetching"
  to work around this)
- access to exactly one bank: bunq

Two days after the bunq transaction feature landed, the integration was
replaced (commit `f33e43f`, 2026-03-23): the 215-line bunq client and the
session cache were deleted (migration 0004) in favour of Enable Banking's
OAuth-style redirect flow with stateless RS256 JWT auth.

## Decision

We will integrate bank data through Enable Banking, an Open Banking / PSD2
aggregator, instead of maintaining a direct bunq API client. The API base URL
and callback URL are configured per environment via environment variables.

## Alternatives considered

- **Keep the direct bunq API.** Rejected: single-bank lock-in, a stateful
  installation/session model that fights a stateless edge runtime, and
  IP-bound credentials incompatible with Cloudflare egress.
- **Other aggregators (Tink, GoCardless/Nordigen, Plaid, etc.).** No
  comparison is recorded in the repo history; Enable Banking offered
  developer-accessible PSD2 coverage of EU banks with a simple JWT +
  OAuth-redirect model that fits Pages Functions.

Note on evidence: the commit history records *what* changed; the *why* above
is partly inferred from the complexity of the code that was deleted rather
than from a written rationale at the time.

## Consequences

- Good: one integration covers any supported EU bank (a bank-selection modal
  was added later with no per-bank code); stateless JWT auth needs no session
  cache; the OAuth redirect flow maps cleanly onto a mockable interface,
  which enabled the in-house mock (ADR 0005).
- Bad: a third-party aggregator now sits between the app and the bank — its
  availability, rate limits, and data normalisation are inherited; PSD2
  consent expiry forces users to periodically reconnect; switching
  aggregators later would mean rewriting the auth flow again.
