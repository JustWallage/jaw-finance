# Public Frontend & Auth Scope Change

## Problem Statement

The app currently lives entirely behind Cloudflare Access (Zero Trust), meaning the login wall is the first thing any visitor sees. There is no public-facing presence — no landing page, no marketing surface, no way for a prospective user to understand what the app does before authenticating. The entire domain is gated.

## Solution

Split the React app into a public zone (`/`, `/terms`, `/privacy`) and an authenticated zone (`/app/*`). Move Cloudflare Access protection from the full domain to only the `/api/*` path. Add a login trigger mechanism so the public frontend can initiate the CF Access auth flow on demand.

## User Stories

1. As a new visitor, I want to see a public homepage at `/`, so that I can understand what the app offers before signing up.
2. As a new visitor, I want to click a "Login" button on the public page, so that I can authenticate and access the app.
3. As an authenticated user, I want my dashboard at `/app`, so that the URL clearly signals I'm in the logged-in area.
4. As an authenticated user, I want to navigate between `/app/chat`, `/app/trends`, `/app/settings` as before, so that nothing breaks after the route move.
5. As an authenticated user whose session expires, I want to be automatically redirected to re-authenticate, so that I don't see cryptic errors.
6. As a visitor, I want to read `/terms` and `/privacy` without logging in, so that I can review legal documents freely.
7. As a returning user, I want the bank connection callback to land me at `/app?connected=true`, so that the flow completes in the authenticated zone.

## Implementation Decisions

### Route restructure (React Router)
- All current authenticated routes move under `/app/*` using a nested `<Route path="app">` with a layout route.
- `/terms` and `/privacy` remain at root level (no change to their path or component).
- A new `PublicHomePage` placeholder is added at `/` (simple heading + Login button).

### AuthGate component
- New component wrapping the authenticated route tree.
- On mount, calls `GET /api/health`. If the response is valid JSON → render children. If non-JSON or network error → `window.location.href = '/api/auth/login'` (full-page navigation triggers CF Access).
- Single responsibility: only answers "is the user authenticated?" — no consent logic.

### Login redirect endpoint (`GET /api/auth/login`)
- Trivial Pages Function that returns HTTP 302 to `/app`.
- Acts as the CF Access "landing pad": after Google auth completes, CF Access forwards the request here, and the handler redirects the user into the authenticated frontend.
- Must be added to the consent middleware bypass list in `_middleware.ts` (alongside `/api/consent`, `/api/health`, `/api/bank/callback`).

### Bank callback redirect update
- `functions/api/bank/callback.ts` changes its redirect targets from `/?connected=true` and `/?bank_error=...` to `/app?connected=true` and `/app?bank_error=...`.

### Terraform (CF Access scope)
- Change the Access Application's `domain` from `"finance.just.wallage.nl"` (full domain) to `"finance.just.wallage.nl/api"` (path-scoped).
- All other Access config stays: Google IdP, allow-everyone policy, 24h session, auto-redirect-to-identity.
- The `CF_Authorization` cookie remains domain-scoped, so it's sent on all requests including `/api/*` after initial auth.

### E2E test updates
- All test navigation calls updated: `/` → `/app`, `/settings` → `/app/settings`, `/chat` → `/app/chat`, `/trends` → `/app/trends`.
- `waitForURL("**/?connected=true")` glob patterns remain unchanged (already match any path).
- No fixture abstraction for the prefix — direct path strings in each test.

### Local dev
- No changes. No CF Access locally, so `AuthGate` calling `/api/health` always succeeds. `VITE_DEV_USER_EMAIL` continues to work for API calls via `authHeaders()`.

## Testing Decisions

- E2E tests are the primary validation. All existing tests must pass after the route migration.
- No new unit tests needed — the changes are structural (routing, redirects) not logic-heavy.
- `AuthGate` is intentionally thin (~15 lines) and tested implicitly through E2E flows.
- The `/api/auth/login` endpoint is a one-line redirect — covered by E2E tests that exercise the bank connection flow (which already tests redirect landing).

## Out of Scope

- Actual public homepage content/design (placeholder only for now)
- One-time PIN (OTP) identity provider
- Changing `auto_redirect_to_identity` to show IdP chooser
- Any changes to the consent flow logic
- Any changes to the AI evaluation or tagging systems

## Further Notes

- The `CF_Authorization` cookie is set at the domain level by CF Access after auth. This means once a user authenticates (via the `/api/auth/login` trigger), all subsequent `fetch('/api/...')` calls from the SPA automatically include the cookie — no explicit token management needed in the frontend.
- The `authHeaders()` helper in `src/lib/auth-headers.ts` remains unchanged. In production it returns `{}` (CF Access handles auth via cookie/header injection). In local dev it sends `VITE_DEV_USER_EMAIL`.

