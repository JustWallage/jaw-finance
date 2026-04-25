#!/usr/bin/env bash
# Start the local full-stack dev server (wrangler pages dev) on port 8788.
# Serves the built dist/ directory with Pages Functions and local D1.
#
# Prerequisites: run scripts/bootstrap.sh first.
# Stop: kill the process or press Ctrl-C.

set -euo pipefail
cd "$(dirname "$0")/.."

export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-dummy}"
export WRANGLER_SEND_METRICS=false

exec pnpm exec wrangler pages dev dist --port 8788
