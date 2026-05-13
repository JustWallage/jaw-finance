#!/usr/bin/env bash
# Starts both dev servers in parallel:
#   pnpm dev       → Vite on :5173 (live reload)
#   pnpm dev:pages → Wrangler on :8788 (proxies :5173, serves Pages Functions + local D1)
#
# Full stack available at http://localhost:8788
# Stop: Ctrl-C or kill the process.

set -uo pipefail
cd "$(dirname "$0")/.."

check_port() {
  if lsof -i ":$1" -sTCP:LISTEN -t &>/dev/null; then
    echo "❌ Port $1 is already in use. Stop the existing process before starting the dev servers." >&2
    exit 1
  fi
}
check_port 5173
check_port 8788

export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-dummy}"
export WRANGLER_SEND_METRICS=false

# If not authenticated with CF (dummy token), strip the [ai] binding
# to avoid wrangler errors. Real local dev keeps the binding for Workers AI.
if [[ "$CLOUDFLARE_API_TOKEN" == "dummy" ]]; then
  cp wrangler.toml wrangler.toml.bak
  sed -i.tmp '/^\[ai\]$/,/^$/d' wrangler.toml
  rm -f wrangler.toml.tmp
fi

pids=()

cleanup() {
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  if [[ -f wrangler.toml.bak ]]; then
    mv wrangler.toml.bak wrangler.toml
  fi
}
trap cleanup EXIT INT TERM

pnpm dev &
pids+=($!)

pnpm dev:pages &
pids+=($!)

# Block until either server exits; both should run indefinitely
wait -n "${pids[@]}" || true
echo "❌ A dev server exited unexpectedly. Check the output above for errors." >&2
exit 1
