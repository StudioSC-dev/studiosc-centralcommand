# Backlog — Near-term

All items below shipped on 2026-09-02. This file is kept for reference; new near-term
items should be added here as they arise.

**Last updated:** 2026-09-03

---

## Quick wins

### ~~QW-1: Homelab card — live icon clipped~~ ✓

Shipped. Fixed with padding to accommodate the box-shadow glow.

### ~~QW-2: Onboarding — default to 9 visible cards~~ ✓

Shipped. `DEFAULT_HIDDEN_KEYS` in types, `defaultHidden` flag in cardCatalog, seeded
on first layout read.

---

## Medium effort

### ~~ME-1: Notifications card — grouping and tabs~~ ✓

Shipped. Dynamic tabs per source, per-source mark-read, badge counts.

### ~~ME-2: World clock card~~ ✓

Shipped. `clock` card, `defaultHidden`, IANA zones stored in `user_settings.clock_zones`,
timezone picker in settings.

### ~~ME-3: Calendar card — add event~~ ✓

Shipped. `POST /api/calendar/events`, `+` button on the calendar card, event creation
dialog.

### ~~ME-4: GitHub activity card~~ ✓

Shipped. `github` card, PAT-based auth (encrypted at rest), multi-account support,
recent commits + open PRs.

### ~~ME-5: Pomodoro / focus timer card~~ ✓

Shipped. `timer` card, `defaultHidden`, 25/5/15 Pomodoro intervals, session history
in `focus_sessions` table.
