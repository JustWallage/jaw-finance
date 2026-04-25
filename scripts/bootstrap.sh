#!/usr/bin/env bash
# Bootstrap script for jaw-finance development environment.
# Installs all dependencies, configures local tooling, builds the project,
# applies DB migrations, and installs Playwright browsers.
#
# Usage: bash scripts/bootstrap.sh
#
# After running this script you can:
#   pnpm check                          — run all static checks (TS + Terraform)
#   pnpm build                          — rebuild after code changes
#   bash scripts/dev-server.sh &        — start the local full-stack server on :8788
#   CI= pnpm test:e2e                   — run E2E tests against localhost:8788

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ── 1. pnpm ──────────────────────────────────────────────────────────────────
echo "▸ Enabling pnpm via corepack…"
corepack enable
corepack prepare pnpm@10.21.0 --activate

echo "▸ Installing npm dependencies…"
pnpm install --frozen-lockfile

# ── 2. Terraform ─────────────────────────────────────────────────────────────
if ! command -v terraform &>/dev/null; then
  echo "▸ Installing Terraform…"
  TF_VERSION="1.12.1"
  TF_ZIP="/tmp/terraform_${TF_VERSION}.zip"
  wget -qO "$TF_ZIP" "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  unzip -o "$TF_ZIP" -d /usr/local/bin
  rm -f "$TF_ZIP"
fi
echo "  Terraform $(terraform --version -json | head -1 | grep -oP '"terraform_version":"\K[^"]+')"

echo "▸ Initialising Terraform providers (no backend)…"
(cd iac && terraform init -backend=false -input=false)

# ── 3. Local wrangler.toml (strip remote AI binding) ────────────────────────
# The [ai] binding connects to Cloudflare remotely and crashes in restricted
# network environments. AI is mocked in local/staging via X-Test-Mock-AI header,
# so the binding is not needed locally.
if grep -q '^\[ai\]' wrangler.toml; then
  echo "▸ Removing [ai] binding from wrangler.toml for local dev…"
  sed -i '/^\[ai\]$/,/^binding = "AI"$/d' wrangler.toml
fi

# ── 4. .dev.vars (dummy secrets for mock banking JWT signing) ────────────────
if [ ! -f .dev.vars ]; then
  echo "▸ Generating .dev.vars with dummy Enable Banking secrets…"
  DUMMY_KEY=$(openssl genrsa 2048 2>/dev/null | openssl pkcs8 -topk8 -nocrypt 2>/dev/null)
  cat > .dev.vars <<VARS
ENABLE_BANKING_APP_ID=dummy-app-id
ENABLE_BANKING_SECRET="${DUMMY_KEY}"
VARS
fi

# ── 5. Build ─────────────────────────────────────────────────────────────────
echo "▸ Building project…"
pnpm build

# ── 6. Local DB migrations ───────────────────────────────────────────────────
echo "▸ Applying local D1 migrations…"
pnpm migrate:local

# ── 7. Playwright ────────────────────────────────────────────────────────────
echo "▸ Installing Playwright browsers…"
pnpm playwright:install

echo ""
echo "✅ Bootstrap complete. Ready to develop."
echo "   Run checks:   pnpm check"
echo "   Run E2E:      bash scripts/dev-server.sh & sleep 5 && CI= pnpm test:e2e"
