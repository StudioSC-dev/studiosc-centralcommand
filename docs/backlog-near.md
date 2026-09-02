# Backlog — Near-term

Quick wins and medium-effort items. Each is self-contained enough for a single session.
Pick one or a natural cluster; check the item off when it ships.

**Last updated:** 2026-09-02

---

## Quick wins

### QW-1: Homelab card — live icon clipped

The pulsing live-status icon on the Homelab card is partially hidden: its left edge is
cut off by the card's border/overflow. A CSS fix — likely the icon's position or the
container's `overflow` near the border radius.

- **Where:** `apps/web/src/components/HomelabCard.tsx`, `apps/web/src/styles.css`
- **Effort:** minutes
- **Verify:** `/layout-lab` at every size the Homelab card can take; both themes

### QW-2: Onboarding — default to 9 visible cards

With 11 cards in the registry, a new user's wall is crowded. D4 (ui-suite.md) says "a
card absent from both stores is visible" — which means every new card auto-shows.

The original 9 cards should be visible by default; `lab` and `notifications` should
start hidden for new users. Options:

1. A `defaultHidden` flag in `cardCatalog.ts` — the server reads it when no
   `dashboard_cards` rows exist for a user and seeds the two hidden rows on first
   layout read. No migration needed; the flag is a constant.
2. Seed hidden rows at user creation time. More explicit but couples signup to the
   card registry.

Option 1 is lighter and keeps D4's spirit (store the exceptions). The flag is
metadata, not state — it says "this card is not part of the starter set", not "hide
it forever".

- **Where:** `apps/web/src/components/cardCatalog.ts`, `apps/api/src/services/dashboard.ts`
- **Effort:** small
- **Verify:** create a fresh user (or clear the demo seed) and confirm only 9 cards
  appear; existing users are unaffected

---

## Medium effort

### ME-1: Notifications card — grouping and tabs

The notifications card currently renders a flat feed. The spine already stores `source`
on every row and `notification_sources` tracks per-source state, so the data is there.

**Scope:**

- **Tabs:** `All` + one tab per source with unread events (e.g. `Lab`, and later
  `Gmail`, `Slack`). Tab shows only that source's feed. Tabs should appear/disappear
  dynamically based on which sources have rows — no hardcoded list.
- **Badge per tab:** unread count, derived from `notification_sources.unread_count`
  (if set) or from the feed (if null) — the COALESCE rule from notifications.md D1.
- **Mark group as read:** a per-source action on each tab, in addition to the existing
  mark-all-read. The `POST /api/notifications/read-all` endpoint already accepts an
  optional `{source}` body — the UI just doesn't expose it.
- **Smaller mark-all-read:** the current button is oversized for a card that now needs
  room for tabs. Shrink it; consider an icon button with a tooltip.
- **Settings integration:** a `notification_groups` user setting for tab order /
  which sources get their own tab vs. fold into "Other". Not required for the first
  pass — dynamic tabs from the data is enough.

**Fit:** the card already uses `useClampList` for its feed. Tabs add a fixed-height
row at the top; the feed list shrinks accordingly. The card uses `ownFit` (formerly
`scrollable`) so the shared drop pass stays out of its way. Confirm in `/layout-lab`.

- **Where:** `apps/web/src/components/NotificationsCard.tsx`, `apps/api/src/routes/notifications.ts`
- **API change:** likely none — the GET already returns source info per row, and
  mark-group-as-read is already wired. Possibly add a `sources` summary to the
  response if not already present.
- **Effort:** a session
- **Verify:** at minimum 1x1 and 2x2 in both themes; `/layout-lab` clean

### ME-2: World clock card

A new card showing current time across user-configured timezones. No external API — 
`Intl.DateTimeFormat` handles everything. Good portfolio piece demonstrating a clean,
self-contained card.

**Scope:**

- New `CardKey`: `clock` (or `worldclock` — decide on naming)
- New `--pillar-clock` accent colour
- Catalog + registry entries; component
- User setting: an ordered list of timezones (IANA names like `Asia/Manila`,
  `America/New_York`). Stored in `user_settings` or `dashboard_cards` — decide
- Display: city label, current time (updating live), date when it differs from the
  user's local date, and a day/night indicator
- **Fit strategy (required by ui-suite D11(e)):** the timezone list clamps with
  `useClampList`; a `ClippedNote` footer says how many are hidden. At 1x1 this might
  be 4–6 timezones; at 2x2, more.

**Open questions:**

- Should this card be `defaultHidden` (QW-2) or visible by default?
- Settings UI for choosing timezones — a searchable list of IANA zones, or a simpler
  preset picker (major cities)?
- Whether to show an analog clock face, a digital readout, or both

- **Where:** new component + catalog/registry entries, `packages/types` for the key,
  a migration for the setting if it gets its own column
- **Effort:** a session
- **Verify:** `/layout-lab` at every size; both themes; responsive breakpoints

### ME-3: Calendar card — add event

The Google Calendar OAuth is already in place with read scopes. Adding event creation
needs the write scope added to the consent flow and a creation endpoint.

**Scope:**

- Add `https://www.googleapis.com/auth/calendar.events` scope to the OAuth flow
  (currently only `.readonly`)
- `POST /api/calendar/events` endpoint — accepts title, start, end, optional
  description/location; creates via Google Calendar API
- UI: a `+` button on the calendar card (edit-mode-independent), opening a minimal
  creation form — title, date/time, optional location. Inline on the card or as a
  dialog (the event detail dialog pattern already exists in `EventDialog.tsx`).
- Re-consent flow: existing users will need to re-authorize to grant the new scope.
  Handle gracefully — if the token lacks the write scope, disable the `+` button with
  a tooltip saying "re-authorize to create events", and provide a re-auth link.

**Constraints:**

- The scope bump from `.readonly` to `.events` may affect the Google OAuth consent
  screen's verification status. Check whether the app is in "testing" or "published"
  mode and whether this scope is sensitive or restricted.
- Creating events must respect `demoReadOnly` — demo users cannot create.

- **Where:** `apps/api/src/routes/calendar.ts`, `apps/api/src/services/google.ts`,
  `apps/web/src/components/CalendarCard.tsx`
- **Effort:** a session
- **Verify:** create an event, confirm it appears in Google Calendar and on the card
  after the next sync; demo session blocked

### ME-4: GitHub activity card

A new card showing recent commits, open PRs, and review requests across the user's
GitHub accounts. GitHub's API is generous on free tier (5,000 req/hour authenticated).

**Scope:**

- New `CardKey`: `github`
- GitHub OAuth or personal access token stored as a user setting (PAT is simpler for
  a single-user app; OAuth is better for multi-user)
- Display: recent commits (last 24h), open PRs needing review, open PRs by the user,
  CI status indicators
- Fetch via GitHub REST API v4 (GraphQL) — a single query can pull commits + PRs +
  reviews efficiently
- KV cache: 5-minute TTL (GitHub data changes frequently but not every minute)

**Fit strategy:** the activity list clamps with `useClampList`. At 1x1, show the
most urgent items (PRs needing review first, then recent commits); at larger sizes,
show more.

- **Where:** new component + catalog/registry, new service in `apps/api/src/services/`,
  new route `apps/api/src/routes/github.ts`
- **Effort:** a session, possibly two (OAuth + card)
- **Verify:** `/layout-lab` clean; both themes; data matches GitHub reality
- **External service:** add to `docs/external-services.md` integration table

### ME-5: Pomodoro / focus timer card

A timer card for focus sessions. No external API — pure frontend state backed by D1
for session history. Complements the productivity dashboard angle and correlates with
calendar busyness and performance scores.

**Scope:**

- New `CardKey`: `focus` (or `timer` — but `focus` ties to the productivity theme)
- Display: a countdown timer (25/5/15 default Pomodoro intervals), session count,
  daily total focus time
- Controls: start, pause, skip break, reset. Sound notification on interval end
  (optional, user setting)
- D1 storage: `focus_sessions` table — start time, duration, completed (boolean).
  Feeds the performance estimator in Phase 2
- No external dependency

**Fit strategy:** the timer display and controls are fixed; the session history list
(today's completed sessions) clamps. At 1x1 the history may be hidden entirely via
`data-drop-order`, leaving just the timer and controls.

**Open:** whether the preset name `Focus` (the layout preset) colliding with a card
named `focus` is confusing. If so, `timer` or `pomodoro` as the key.

- **Where:** new component + catalog/registry, migration for `focus_sessions`,
  `packages/types` for the key
- **Effort:** a session
- **Verify:** `/layout-lab` clean; timer works across card sizes; history persists

---

## Suggested order

1. **QW-1** + **QW-2** together (quick, and QW-2 matters before adding more cards)
2. **ME-1** (notifications cleanup — the card exists, make it good)
3. **ME-2** (world clock — a clean new card, no external deps)
4. **ME-3** or **ME-4** (calendar write or GitHub — both add real utility)
5. **ME-5** (focus timer — nice to have, lower priority)
