# Public landing page (hero + CTA)

Type: AFK

## Parent

[webfacing-frontend.md](./webfacing-frontend.md)

## What to build

Replace the minimal placeholder `public/index.html` with a proper marketing landing page. The page communicates what jaw-finance is, highlights 2-3 key features, and has a clear "Get started" call-to-action that links to `/app` (which triggers Cloudflare Access login).

Design uses Tailwind CSS via CDN, own marketing identity (bolder hero, larger typography, more whitespace) while sharing the app's color palette and font. Fully responsive (mobile-first).

## Acceptance criteria

- [ ] `public/index.html` has a hero section with a clear value proposition
- [ ] 2-3 feature highlights are shown (e.g., bank connection, AI tagging, natural language queries)
- [ ] "Get started" CTA button links to `/app`
- [ ] Page uses Tailwind CSS via CDN (no build step)
- [ ] Responsive layout works on mobile, tablet, and desktop
- [ ] Page loads without JavaScript (pure HTML + CSS)
- [ ] Shares color palette with the authenticated app
- [ ] `pnpm build` succeeds (page is copied to `dist/` as-is)

## Blocked by

- Restructure SPA to `/app` with public page infrastructure (public page infrastructure must exist)
