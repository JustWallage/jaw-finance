# Homepage refresh button with auto-refresh on stale connections

Type: AFK
Blocked by: None

## What to build

When the user opens the homepage, automatically refresh transactions if the last successful refresh was more than 2 hours ago. Also add a manual refresh button (icon-only `RefreshCw`, top-right above the transaction list) that always fires regardless of staleness.

The system tracks when each bank connection was last successfully refreshed via a `last_refreshed_at` column. On homepage mount, if the oldest `last_refreshed_at` across all connections exceeds 2 hours AND the client hasn't attempted a refresh in the last 5 minutes (in-memory ref, not persisted), auto-refresh triggers. The client updates its own "last refresh" timestamp using `Date.now()` after success — no server timestamp in the response body is needed.

A mock endpoint `POST /mock-enable-banking/set-last-refreshed` allows E2E tests to control the timestamp directly.

## Acceptance criteria

- [ ] Migration adds `last_refreshed_at TEXT` column (default NULL) to `bank_connections`
- [ ] After successful transaction sync, backend sets `last_refreshed_at = datetime('now')` on the connection
- [ ] Homepage shows a `RefreshCw` icon button (top-right, above transaction list) when an active connection exists
- [ ] Button click always triggers refresh (bypasses cooldown), animates (spin) while loading
- [ ] On mount: auto-refresh fires when oldest `last_refreshed_at` > 2 hours AND no refresh attempted in last 5 minutes
- [ ] On mount: no auto-refresh if `last_refreshed_at` ≤ 2 hours
- [ ] Mock endpoint `POST /mock-enable-banking/set-last-refreshed` accepts `{ connectionId, timestamp }` and updates the DB directly
- [ ] E2E tests cover: stale → auto-refresh, fresh → no auto-refresh, manual button always works