# Expired connection warning banner

Type: AFK
Blocked by: None

## What to build

When a bank connection has expired (past `valid_until`), show a prominent red Alert banner on the homepage informing the user and offering a "Reconnect" action that navigates to `/settings`. On the settings page, the reconnect button for expired connections should use the red/destructive variant styling.

This uses the existing `valid_until` field on `bank_connections` — no new columns needed. The condition is: `connections.length > 0 && !activeConnection` (i.e., connections exist but none are valid).

## Acceptance criteria

- [ ] Homepage shows a red Alert banner when connections exist but all are expired
- [ ] Banner text communicates "connection expired" and includes a "Reconnect" button
- [ ] Clicking "Reconnect" navigates to `/settings`
- [ ] Settings page shows the reconnect button in red/destructive variant when the connection is expired
- [ ] No banner shown when an active (non-expired) connection exists
- [ ] No banner shown when no connections exist at all (first-time user)
- [ ] E2E test: mock expired connection → banner visible → click navigates to settings
