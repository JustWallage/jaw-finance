# UI Redesign v2 — Design Document

## Aesthetic Direction

**Editorial + Slight Vibrant Fintech.** Clean whitespace and strong typographic hierarchy (editorial), with strategic vibrant color accents and polished micro-interactions (fintech). Think Linear meets a cleaner Monzo.

## Design System

### Theme

**Light-first.** Dark mode deferred to a follow-up. All colors defined as CSS variables for easy theme swapping later.

### Color Palette

| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(0.98 0.01 80)` | Warm cream page background |
| `--foreground` | `oklch(0.15 0.01 60)` | Primary text |
| `--card` | `oklch(1 0.005 80)` | Card surface (slightly warmer than pure white) |
| `--card-foreground` | `oklch(0.15 0.01 60)` | Card text |
| `--primary` | `oklch(0.70 0.14 35)` | **Burnt Coral** — buttons, active nav, primary actions |
| `--primary-foreground` | `oklch(0.99 0 0)` | Text on primary |
| `--secondary` | `oklch(0.95 0.01 80)` | Secondary surfaces |
| `--muted` | `oklch(0.93 0.01 70)` | Muted backgrounds, borders |
| `--muted-foreground` | `oklch(0.50 0.02 60)` | Subdued text, labels |
| `--accent` | `oklch(0.80 0.08 35)` | Lighter coral for hover states, highlights |
| `--destructive` | `oklch(0.60 0.20 25)` | Error/destructive red (warm-toned to match palette) |
| `--border` | `oklch(0.90 0.01 70)` | Subtle warm borders |
| `--income` | `oklch(0.55 0.15 155)` | Income green (desaturated, not neon) |
| `--expense` | `oklch(0.58 0.14 20)` | Expense red (warm, muted) |

### Typography

**Sora** — geometric, modern, slightly playful. Single family for headings and body.

| Usage | Weight | Size |
|---|---|---|
| Page title | 700 (Bold) | 1.75rem / `text-[1.75rem]` |
| Section heading | 600 (Semibold) | 1.125rem |
| Body text | 400 (Regular) | 0.875rem |
| Labels / captions | 400 | 0.75rem |
| Monospace (amounts) | Sora or tabular nums | — |

Install: `@fontsource-variable/sora` (replaces `@fontsource-variable/geist`).

### Motion

Library: **Motion** (formerly Framer Motion) — `motion` package.

Effects:
- **Page load:** Staggered fade-in of sections (chat → chart → transaction groups). 100ms delay between groups.
- **Transaction groups:** Each date group fades/slides in with a stagger.
- **Number count-up:** Income/expense totals animate from 0 to value on load.
- **Chart:** Area fills in smoothly from left to right on mount.
- **Skeleton loading:** Pulsing placeholder shapes for chart, transaction rows, and summary cards while data loads.
- **Hover states:** Subtle lift on cards (translateY -2px + shadow increase).
- **Nav transitions:** Active indicator slides between nav items.

## Page Structure & Routing

### Navigation (Bottom Nav — 4 items)

| Icon | Label | Route | Description |
|---|---|---|---|
| Home | Home | `/` | Dashboard: chat input, area chart, grouped transaction feed |
| MessageCircle | Chat | `/chat` | Dedicated chat: input + result card only |
| TrendingUp | Trends | `/trends` | Area chart with date range, tag spending breakdown, tag query search, tag management (unconfirmed/confirmed/rejected) |
| Settings | Settings | `/settings` | Bank connections, account nicknames, user email, import history |

### Account Switcher

Small pill in the global header (Layout component), visible on all pages. Shows the active account name. Tapping opens a dropdown to switch. "Edit names" option leads to Settings.

### Hide Income Toggle

Small eye icon in the global header, next to the account pill.

---

## Page Designs

### Home (`/`)

**Hero: Chat Input**
- Large, prominent input field with placeholder "Ask about your finances..."
- Send button with Burnt Coral accent
- When submitted, navigates to `/chat` with the question as a URL search param or passed via state
- When no bank is connected: input is disabled, placeholder reads "Connect a bank to get started"

**Area Chart (Income/Expense)**
- Below the chat input
- Recharts `AreaChart` with two areas: income (green fill with gradient) and expense (red fill with gradient)
- X-axis: months (last 6 months from `useIncomeAnalytics`)
- Smooth curves (`type="monotone"`)
- Current month values displayed as large stats above the chart: `+1,234.56 EUR` (green) / `-987.65 EUR` (red)
- Subtle grid lines, warm-toned
- When no data: blurred mock chart with "Connect a bank to see your trends" overlay

**Grouped Transaction Feed**
- Transactions grouped by date: "Today", "Yesterday", "Mon 12 May", etc.
- Each group has a date header with a daily subtotal (net amount)
- Each transaction row: counterparty name (left), amount (right, colored), small description below counterparty in muted text
- Tag badges inline on each row (small, rounded)
- Click opens the existing transaction detail dialog
- When no data: blurred mock transaction rows

**Empty State (No bank connected)**
- Chat input disabled
- Blurred/dimmed mock chart and mock transaction feed visible behind a centered CTA card: "Connect your bank account" with a prominent button leading to bank selection (which now lives in Settings, but the CTA should initiate the flow directly)

### Chat (`/chat`)

- Chat input at the top (same styling as Home hero)
- Below: result card when a question has been answered
  - AI summary text
  - Income/expense totals
  - By-path breakdown (if present)
  - Expandable transaction list
- When no question asked yet: just the input, no other elements
- "Thinking..." loading state with animated dots

### Trends (`/trends`)

**Area Chart (Full)**
- Same chart as Home but larger, with date range selection (dropdown or date pickers for start/end)
- More detailed: monthly bars or extended time range

**Tag-Based Spending Breakdown**
- Shows spending grouped by top-level tags
- Compact list or bar visualization

**Tag Query Search**
- Moved from current Tags page
- Glob pattern input + date range + search button
- Results in a dialog (same as current)

**Tag Management**
- Sections: Unconfirmed (count), Confirmed (count)
- Badge list with click-to-detail
- "View Rejected Tags" button opening modal
- Tag detail dialog: confirm/reject/edit name, linked transactions
- Auto-Tag Pending button: "Auto-Tag Pending (N)" — triggers batch evaluation

### Settings (`/settings`)

**Bank Connections Section**
- Active connection card: bank name, country badge, IBAN, valid until date
- "Reconnect" button
- "Connect Bank" button (opens bank selection dialog)
- Import History dropdown (3 months, 1 year, 5 years)
- Expiry warning alert (if expiring soon)

**Account Nicknames**
- List of connected accounts with editable nickname fields
- Save button

**User Info**
- Display user email
- Links to Terms & Privacy pages

---

## Component Changes

### Layout.tsx
- Remove `dark` class from container
- Change background to warm cream (`bg-background`)
- Add global header bar: "JAW Finance" title (left), account pill + hide income toggle (right)
- Update bottom nav to 4 items: Home, Chat, Trends, Settings
- Active nav indicator: filled icon + Burnt Coral color, with sliding indicator animation

### HomePage.tsx
- Restructure into: chat input → area chart → grouped transaction feed
- Extract chart into a `<IncomeExpenseChart />` component
- Extract grouped feed into a `<TransactionFeed />` component
- Remove bank connection management (moved to Settings)
- Remove account switcher (moved to Layout header)
- Remove user menu dialog (moved to Settings)
- Add Motion animations for staggered load

### New: ChatPage.tsx
- Simple page: chat input + result card
- Reuse chat logic from current HomePage (extract into a `useChat` hook)
- Route: `/chat`

### New: TrendsPage.tsx
- Combines current TagsPage content + tag query search + extended chart
- Auto-Tag button lives here
- Route: `/trends`

### New: SettingsPage.tsx
- Bank connection management extracted from HomePage
- Account nicknames
- User info
- Route: `/settings`

### TagSelector.tsx
- No structural changes, just theme updates (colors, borders)

### ConsentGate.tsx
- Theme update only (light mode styling)

### New: IncomeExpenseChart.tsx
- Recharts `AreaChart` with income/expense areas
- Gradient fills
- Responsive container
- Props: `data: MonthlyIncome[]`, `currentIncome: number`, `currentExpense: number`

### New: TransactionFeed.tsx
- Groups transactions by date
- Date headers with subtotals
- Individual transaction rows with tag badges
- Click handler for detail dialog
- Props: `transactions: DBTransaction[]`, `onSelect: (txId: number) => void`

---

## New Dependencies

| Package | Purpose |
|---|---|
| `@fontsource-variable/sora` | Sora font |
| `motion` | Animations (staggered reveals, count-ups) |
| `recharts` | Area chart for income/expense |

Remove: `@fontsource-variable/geist`

---

## E2E Test Impact

All `data-testid` attributes will be preserved. Key changes:

| Current selector | Change |
|---|---|
| `transactions-table` | Replaced by grouped feed — need to update tests to interact with feed rows instead of table rows |
| `tx-row-{id}` | Kept, but DOM structure changes from `<tr>` to `<div>` — test selectors via `data-testid` still work |
| `connect-button` | Moves to Settings page — tests need to navigate there first |
| `reconnect-button` | Moves to Settings |
| `import-history-button` | Moves to Settings |
| `account-switcher` | Moves to Layout header — still globally accessible |
| `nav-tags` | Changes to `nav-trends` |
| `batch-evaluate-button` | Moves to Trends page |
| `chat-*` selectors | Chat result card now on `/chat` page — tests need to handle navigation |
| `query-*` selectors | Move to Trends page |
| `unconfirmed-section`, `confirmed-section` | Move to Trends page |

Tests that need navigation updates:
- `bank-transactions.spec.ts` — connect/import flows go through Settings
- `ai-tagging.spec.ts` — batch evaluate on Trends, single evaluate stays in transaction dialog
- `nl-chat.spec.ts` — chat submission navigates to Chat page
- `tag-query.spec.ts` — query section on Trends page
- `tagging.spec.ts` — tag management on Trends page

---

## Migration Strategy

**Big bang** — single implementation pass. All pages redesigned at once. E2E tests updated in the same PR.

Order of implementation:
1. Install dependencies (Sora font, Motion, Recharts)
2. Update theme/color system in `index.css`
3. Update Layout (header, nav, remove dark mode)
4. Create shared components (IncomeExpenseChart, TransactionFeed)
5. Extract hooks (useChat from HomePage)
6. Build new pages (ChatPage, TrendsPage, SettingsPage)
7. Redesign HomePage
8. Update App.tsx routing
9. Update E2E tests
10. Validate: `pnpm check` → `pnpm build` → E2E tests pass
