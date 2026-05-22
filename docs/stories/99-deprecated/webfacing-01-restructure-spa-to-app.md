# Restructure SPA to `/app` with public page infrastructure

Type: AFK

## Parent

[webfacing-frontend.md](./webfacing-frontend.md)

## What to build

Move the authenticated React SPA from the domain root to `/app/*` and set up the infrastructure for static public pages at the root. After this change, visiting `/app` loads the dashboard (behind Cloudflare Access login), while `/`, `/terms`, and `/privacy` serve static HTML pages without authentication.

The SPA continues to work exactly as before — all routes, all features — just namespaced under `/app`. Terms and privacy content is ported from the React components to static HTML files. A minimal placeholder landing page is included (just the app name and a link to `/app`).

Vite builds the SPA bundle to `dist/app/`, static pages from `public/` land at `dist/` root, and a `_redirects` file handles SPA fallback for `/app/*` paths. The Enable Banking callback redirects to `/app` instead of `/`. Local dev is unchanged.

## Acceptance criteria

- [ ] Vite config has `base: '/app/'` and outputs SPA to `dist/app/index.html`
- [ ] `BrowserRouter` has `basename="/app"`
- [ ] Terms and privacy routes removed from React Router
- [ ] All internal links to terms/privacy use plain `<a href="/terms">` / `<a href="/privacy">`
- [ ] `public/_redirects` contains `/app/*  /app/index.html  200`
- [ ] `public/index.html` exists (minimal placeholder with link to `/app`)
- [ ] `public/terms/index.html` exists with terms content
- [ ] `public/privacy/index.html` exists with privacy content
- [ ] Enable Banking callback redirect changed from `/` to `/app`
- [ ] Playwright `baseURL` updated to include `/app`
- [ ] `pnpm check` passes
- [ ] `pnpm build` succeeds with correct output structure
- [ ] Full E2E test suite passes at the new path

## Blocked by

None - can start immediately
