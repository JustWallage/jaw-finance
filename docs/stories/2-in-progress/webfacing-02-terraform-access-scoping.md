# Terraform: scope Access to `/app` and `/api` paths

Type: AFK

## Parent

[webfacing-frontend.md](./webfacing-frontend.md)

## What to build

Replace the single Cloudflare Access application (currently protecting the entire `finance.just.wallage.nl` domain) with two path-scoped applications: one protecting `/app*` and one protecting `/api*`. This makes the domain root and all non-app/non-api paths publicly accessible without authentication.

Both applications use the same "Allow Google login" policy with `include = [{ everyone = {} }]`. The existing service token policy for CI/E2E also applies to both.

## Acceptance criteria

- [ ] Terraform has two `cloudflare_zero_trust_access_application` resources: one for `finance.just.wallage.nl/app`, one for `finance.just.wallage.nl/api`
- [ ] Original single Access application resource is removed
- [ ] Both applications use the same Google login allow policy
- [ ] `pnpm check` passes (includes `terraform fmt` and `terraform validate`)
- [ ] After deployment: visiting `finance.just.wallage.nl/` does NOT trigger Cloudflare Access login
- [ ] After deployment: visiting `finance.just.wallage.nl/app` DOES trigger Cloudflare Access login
- [ ] After deployment: calling `finance.just.wallage.nl/api/health` DOES require Access authentication

## Blocked by

- Restructure SPA to `/app` with public page infrastructure (app must be served at `/app` before Access is scoped there)
