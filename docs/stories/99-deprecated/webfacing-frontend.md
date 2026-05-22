# Public-Facing Frontend

## Problem Statement

The application currently sits entirely behind Cloudflare Access (Google login). Visitors who discover the URL see nothing but a login wall — no information about what the product is, what it does, or why they should sign up. There's no way to communicate value before demanding authentication.

## Solution

Add a public-facing frontend at the domain root (`/`) with static marketing pages (landing, terms, privacy). Move the authenticated SPA to `/app/*` and the API stays at `/api/*`. Cloudflare Access is scoped to only those two path prefixes, leaving everything else publicly accessible. The landing page has a hero section with value proposition and a CTA that navigates to `/app` (triggering login).

## User Stories

1. As a first-time visitor, I want to see what this app does before logging in, so that I can decide if it's worth connecting my bank.
2. As a first-time visitor, I want to see a clear "Get started" button on the landing page, so that I know how to sign up.
3. As a first-time visitor, I want to read the terms and privacy policy without logging in, so that I can understand data handling before committing.
4. As a returning user, I want `/app` to take me directly to my dashboard after login, so that my workflow is unchanged.
5. As a returning user, I want my bookmarked `/app/settings` or `/app/chat` links to still work, so that I don't lose my navigation shortcuts.
6. As the developer, I want the public pages to be plain HTML with no build dependencies, so that they're trivial to edit and fast to load.
7. As the developer, I want the Cloudflare Access configuration managed in Terraform, so that access control changes go through the same CI pipeline.
8. As the developer, I want existing E2E tests to pass without rewriting them, so that the migration doesn't introduce regressions.
9. As a search engine crawler, I want public pages to be server-rendered HTML, so that the site is indexable without JavaScript.
10. As a visitor on mobile, I want the landing page to be responsive, so that it looks good on any screen size.

## Implementation Decisions

### Architecture: Path-based split

- The domain `finance.just.wallage.nl` is split by path:
  - `/app/*` — authenticated React SPA (protected by Cloudflare Access)
  - `/api/*` — authenticated API (protected by Cloudflare Access)
  - Everything else — public static pages (no auth)
- Two Cloudflare Access applications in Terraform: one scoped to `finance.just.wallage.nl/app`, one to `finance.just.wallage.nl/api`. Same Google login policy on both.

### Static public pages

- Plain HTML files with Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com">`).
- Stored in `public/` directory (Vite copies them to `dist/` as-is during build).
- Pages: `public/index.html` (landing), `public/terms/index.html`, `public/privacy/index.html`.
- Design: own marketing identity (bolder hero, larger type, more whitespace) sharing the same color palette and font as the app.

### SPA reconfiguration

- `BrowserRouter` gets `basename="/app"`.
- Vite config gets `base: '/app/'` so asset URLs resolve under `/app/`.
- The SPA's built `index.html` outputs to `dist/app/index.html`.
- `public/_redirects` contains `"/app/*  /app/index.html  200"` for Cloudflare Pages SPA fallback.
- Terms and privacy routes removed from React Router. Links to them become plain `<a href="/terms">` tags.

### Backend changes

- Enable Banking OAuth callback redirect changes from `/` to `/app`.
- No API path changes.

### Playwright / E2E

- `baseURL` in `playwright.config.ts` updated to include `/app`.
- No new tests needed — existing suite validates the app works end-to-end at the new path.

### Local development

- Unchanged. Vite dev server still serves the SPA at `/` locally. Public pages are only visible via `pnpm build && pnpm preview`.
- `wrangler pages dev --proxy 5173` continues working as-is.

### Access control

- Open to everyone with a Google account (current policy, no change).
- Consent gate remains the first interaction inside `/app`.

## Testing Decisions

- **What makes a good test here:** Tests verify the user-facing behavior (can navigate, can log in, can use the app at the new path) rather than implementation details of the routing.
- **Modules tested:** The existing E2E suite (Playwright) covers all authenticated flows. Running the full suite at the new `baseURL` validates the migration.
- **Prior art:** All existing specs in `tests/*.spec.ts` — they test flows end-to-end against the running app.
- **No new test files needed** unless a future slice adds content to the public pages that warrants verification.

## Out of Scope

- About page and Contact page (future follow-up).
- Public page content copywriting and visual design polish.
- Analytics or tracking on public pages.
- Public-facing API (all API routes remain authenticated).
- User onboarding flow improvements beyond the existing consent gate.
- Rate limiting or abuse protection for the public site.

## Further Notes

- The existing `webfacing-frontend.md` story in `docs/stories/1-todo/` is superseded by this PRD.
- The restructure is a prerequisite for any future public-facing features (pricing page, blog, changelog, etc.).