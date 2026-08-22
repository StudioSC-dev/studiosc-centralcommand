# UI Suite — dynamic dashboard layout

**Scope:** per-user control over *which* cards appear on the dashboard and *how large* each
one is, on a uniform cell grid.
**Status:** Phase 0 audit complete · Phases 1–4 not started (no code written)
**Owner branch:** `feat/ui-suite` → `dev`
**Last updated:** 2026-08-22

Companion documents:

- [`../../integrations/homelab-telemetry.md`](../../integrations/homelab-telemetry.md) —
  originating contract. Its **Phase 1 build order (1.1–1.9)** is the same work as this
  document's Phase 1, restated here with the sizing phases the contract deliberately
  deferred. **Decisions recorded here must be mirrored there**, because the homelab side
  reads that file.
- `HANDOVER.md` (gitignored) — the session narrative.

---

## 1. Why this exists

Two independent forces landed on the same missing feature:

1. **The grid is exactly full.** `apps/web/src/styles.css` `.dashboard` pins three
   viewport-filling rows against three columns, and `apps/web/src/routes/index.tsx`
   hardcodes exactly nine cards. There is no tenth slot. A Homelab card — the next card in
   the queue — cannot be added at all until this lands.
2. **Not every user wants all nine.** The dashboard is multi-user by design; a user with no
   Riot account still gets a League card, and a user who never logs sleep still gets Health.

Sizing is the second half of the same problem: once cards can be hidden, the remaining ones
should be able to grow into the space, and some cards (News, Calendar) have always wanted
more room than a 1×1 tile gives them.

---

## 2. What exists today (audit, 2026-08-22)

### 2.1 Already implemented

| Thing | Where | Note |
|---|---|---|
| 3×3 viewport-filling grid | `styles.css:681` `.dashboard` | `repeat(3, minmax(0,1fr))` columns × `repeat(3, minmax(0,1fr))` rows, `height: calc(100vh - 56px - 1.8rem - 8px)`. No page scroll — overflow scrolls *inside* cards. |
| Responsive step-down | `styles.css:712`, `:721` | ≤1100px → 2 columns, fixed `--card-h: 440px`, page scrolls. ≤720px → 1 column. |
| `.span-2` class | `styles.css:706` | `grid-column: span 2`, plus a ≤720px override back to `span 1`. **Declared but applied to nothing** — the only pre-existing sizing primitive, and it is dead code. |
| Shared card shell | `components/Card.tsx` | `title` + `pillar` props → `<section class="card pillar-*">` with a non-scrolling title and a scrolling `.card-body`. |
| Per-pillar accents | `styles.css:60-68` | Nine `--pillar-*` custom properties; `pillar-<key>` sets `--card-accent`. **The nine pillar keys already exist as a de facto card-key union** — see D3. |
| Settings teaser | `routes/settings.tsx:358` | A `.settings-disabled` block reading *"Resizing cards and choosing which to enable/disable is under development."* This is the UI stub this work fills in. |
| Demo write-block | `apps/api/src/middleware/demo.ts` → `index.ts:49` | `demoReadOnly` blocks every non-GET for demo sessions. Layout `PATCH` inherits this for free. |
| Settings storage | `packages/db/schema.ts:75` `user_settings` | Per-user row (`timezone`, `homeLat`, `homeLon`, `locationLabel`, `units`). The natural home for layout state. |

### 2.2 Not implemented — nothing else exists

Searched the source, `CLAUDE.md`, and all 1,893 lines of `HANDOVER.md`: **there is no card
registry, no card-key type, no layout table or column, no layout endpoint, and no toggle
UI.** Every phase below is greenfield. The `.span-2` class and the settings teaser are the
entire prior art.

### 2.3 Findings that shape the plan

These came out of the audit and are the reason the phases are ordered the way they are.

- **Two cards bypass the `Card` shell.** `NewsCard.tsx:122` and `WeatherCard.tsx:157` render
  their own `<section className="card …">` instead of using `<Card>`. Any size class has to
  reach *both* paths, so the registry (P1.3) must own the outer element or `Card` must gain a
  `className` passthrough that both hand-rolled shells also honour. Left unhandled, sizing
  silently does nothing on two of nine cards.
- **Card internals assume roughly one tile.** `GamingCard.tsx:130` slices to 6 matches;
  `CalendarCard.tsx:8` caps at `MAX_EVENTS = 10`; the League card's CSS is commented
  *"portioned layout … fits without scroll"*. A 2×2 League card would show six matches in
  double the space. **Content that adapts to size is its own phase (P3)** and is explicitly
  not smuggled into P2.
- **The no-scroll invariant is load-bearing.** The wall layout's whole point is that the
  3×3 fits a secondary monitor with no page scroll. Variable spans can break this in a way
  hiding cards cannot, which is why P2 carries a cell-budget rule (D5) rather than free-form
  sizing.
- **`user_settings` has no layout column**, and the latest migration is `0011_sweet_morph.sql`
  (16 tables). The next migration number is **`0012`**.

---

## 3. Decisions

### D1 — The grid substrate stays a 3-column × 3-row unit grid

**Decided 2026-08-22.** Cards are homepage-style widgets, so *uniformity is the goal, not
flexibility*. The unit cell is exactly today's card. Sizes are spans of it: `1×1` (default),
`2×1`, `1×2`, `2×2`, `3×1`.

The three candidates, weighed:

| | **A. 3×3 unit grid** (chosen) | **B. 9×9 fine grid** | **C. 12-column grid** |
|---|---|---|---|
| Unit cell | Today's card | ⅓ of a card each way | 1/12 width × free-height row |
| Symmetry | **Enforced by construction** — every card is a whole number of identical tiles | Not enforced; 81 cells invite ragged, non-uniform sizes | Enforced horizontally only; heights drift |
| Sizes named (2×1, 1×2, 1×3, 2×2) | Express directly | Become 6×3, 3×6, 3×9, 6×6 — same shapes, worse names | Need translating (2×1 → `span 8`?) |
| Wall no-scroll invariant | Preserved — spans tile a fixed cell count | Preserved but far harder to reason about | **Lost** — variable rows reintroduce page scroll |
| CSS cost | One class per size (5 classes) | ~5× the classes, all multiples of 3 | Rewrite `.dashboard` and all three breakpoints |
| Type/state cost | Small enum union | Two free integers, needs validation | Two free integers + order |
| Future span/reorder | Adequate | Adequate | Best-in-class |
| Risk | Coarse: no half-tiles | Users can build an ugly wall; more ways to fail | Abandons a layout Session 31 deliberately pinned |

**A wins on the stated goal.** B's only advantage is granularity, which is precisely what
*"symmetric and uniform"* rules out — it buys the ability to make the wall irregular. C is
the better substrate for a scrolling web dashboard and the worse one for a fixed wall
display, which is what this is.

**Recorded alternative:** if the dashboard ever stops being a fixed-viewport wall display
(e.g. becomes a scrolling mobile-first surface), C is the correct migration target and this
decision should be revisited rather than patched.

### D2 — Columns are derived from the visible card count; rows stay pinned at 3

`columns = min(4, ceil(totalCells / 3))`, rows always 3. Nine 1×1 cards → today's 3×3. A
tenth card → 4 columns, 12 slots. Beyond 12 cells the tiles get too narrow for a wall
display, and that cap is the honest limit, surfaced in the UI rather than hidden.

Carried from the integrations contract, extended from *card count* to *cell count* because
sizing is now in scope.

### D3 — `CardKey` is a closed union in `packages/types`, and the nine pillar keys are it

`weather · summary · perf · calendar · tasks · health · gaming · insights · news`. These
already exist as the `--pillar-*` CSS custom properties and the `pillar` prop, so the union
codifies something real rather than inventing a parallel vocabulary. A typo becomes a build
error in both apps.

Note the union is *not* the existing `Pillar` type in `packages/types/src/index.ts:18` —
that one is data-pillar-shaped (`fitness`, `nutrition`, `sleep` are separate; there is no
`summary` or `insights`). **They are different sets and must not be merged.**

### D4 — Store the exceptions, not the state

`hidden_cards` (a set of keys the user has hidden) and `card_sizes` (a sparse map of
key → non-default size). A card absent from both gets the default: visible, 1×1.

A new card therefore appears for every existing user automatically, with no backfill and no
per-release row rewrite. This is exactly what the Homelab card needs, and it is why storage
is a **JSON column on `user_settings`** rather than a `dashboard_cards` table — one
migration, no joins, no rows to backfill. When reordering lands (P4) a table becomes the
better shape, and the data migration is one real user plus the demo seed.

### D5 — A cell budget, enforced client-side, warned not blocked

`sum(width × height)` across visible cards must not exceed `columns × 3`. The settings UI
shows a budget meter. Over budget is **prevented** (the size option is disabled with a
reason); under budget is **allowed** with a hint, because a deliberately sparse wall is a
legitimate choice and `grid-auto-flow: dense` fills what it can.

This is what keeps "cards can be any size" from quietly reintroducing a page scrollbar on
the wall display.

### D6 — Server validates, client optimises

The API is the authority: unknown keys rejected, sizes checked against the enum, budget
recomputed server-side. The client toggle is optimistic for feel, but a malformed `PATCH`
never persists. Card visibility is a **preference, never a privacy boundary** — anything
that must not be seen is filtered server-side, independent of layout.

### D7 — Sizing does not change card content in P2

A resized card gets more space and the same content. Adapting item counts and internal
layout to the available tile is **P3**, deliberately separated so P2 can ship on visual
inspection alone.

### D8 — Below the wall breakpoint, sizes collapse

At ≤1100px (2-column) horizontal spans clamp to the column count; at ≤720px (1-column)
every card is 1×1. The existing `.span-2 { grid-column: span 1 }` override at
`styles.css:725` is the precedent and generalises to the whole size set. Vertical spans are
kept at ≤1100px (there is room) and dropped at ≤720px.

---

## 4. Phases

Each numbered row is a commit-sized unit. A phase is shippable only at its last row, but
**every row must typecheck and build on its own**.

### Phase 1 — Visibility (show/hide)

Ships alone, useful alone, and is the hard gate for a tenth card. No homelab dependency.
This is the integrations contract's build order 1.1–1.9 verbatim.

| # | Deliverable | Where | Notes |
|---|---|---|---|
| 1.1 | `user_settings.hidden_cards` JSON column + migration **`0012`** | `packages/db` | D4. Nullable TEXT holding a JSON array; `null` → nothing hidden. |
| 1.2 | `CardKey` union + `DashboardLayout` type | `packages/types` | D3. Single source of truth for the nine keys. |
| 1.3 | **Card registry** replacing the nine hardcoded JSX tags | `apps/web` | **Keystone.** `key → { component, title, pillar }`. Pure refactor, zero behaviour change — verify by visual parity. Must resolve the two hand-rolled shells (§2.3). |
| 1.4 | `GET` / `PATCH /api/dashboard/layout` | `apps/api` | User-scoped, validated against `CardKey`, server default when no row exists. `demoReadOnly` already blocks the `PATCH` for demo sessions. |
| 1.5 | `useDashboardLayout` hook; render registry filtered by layout | `apps/web` | Optimistic toggle; shared `queryOptions` like `settingsQueryOptions`. |
| 1.6 | Variable-count grid CSS | `apps/web` | D2. `columns = min(4, ceil(N/3))`, rows pinned at 3, driven by a `data-cols` attribute or CSS custom property on `.dashboard`. |
| 1.7 | Settings toggles section | `apps/web` | Replaces the `.settings-disabled` teaser at `routes/settings.tsx:358`. Where the feature becomes usable rather than merely present. |
| 1.8 | Demo default layout | `packages/db/seed-demo.sql` | Demo shows all nine. |
| 1.9 | Verification | — | See §7. |

### Phase 2 — Sizing (spans)

Depends on the P1 registry. This is the half the integrations contract explicitly deferred
("size and reorder become a separate follow-up"), pulled forward by this session's scope.

| # | Deliverable | Where | Notes |
|---|---|---|---|
| 2.1 | `user_settings.card_sizes` JSON column + migration **`0013`** | `packages/db` | D4. Sparse `{ key: "2x1" }` map; absent → `1x1`. |
| 2.2 | `CardSize` union + size→span helper | `packages/types`, `packages/utils` | `1x1`, `2x1`, `1x2`, `2x2`, `3x1`. Closed set (D1). |
| 2.3 | Cell-budget calculator | `packages/utils` | D5. Shared by client meter and server validation — one implementation, two callers. |
| 2.4 | Size classes + `grid-auto-flow: dense` | `apps/web/styles.css` | Generalises the dead `.span-2` (§2.1) into the full set. Retire `.span-2`. |
| 2.5 | Registry emits size class; both hand-rolled shells honour it | `apps/web` | The §2.3 finding lands here if not fully resolved in 1.3. |
| 2.6 | `PATCH` accepts sizes; server-side budget validation | `apps/api` | D6. |
| 2.7 | Size picker in settings + budget meter | `apps/web` | Over-budget options disabled with a reason (D5). |
| 2.8 | Breakpoint collapse rules | `apps/web/styles.css` | D8. |
| 2.9 | Demo seed sizes + verification | — | A non-trivial demo layout proves the feature to portfolio visitors. |

### Phase 3 — Size-aware card content

Makes a bigger card *worth* being bigger. Deliberately separate from P2 (D7).

| # | Deliverable | Notes |
|---|---|---|
| 3.1 | Size context available to card bodies | Registry passes the resolved size down; no card reads the DOM. |
| 3.2 | Calendar honours its tile | `MAX_EVENTS = 10` becomes a function of height. |
| 3.3 | League honours its tile | The 6-match slice and the "fits without scroll" portioning become size-aware. |
| 3.4 | News honours its tile | The card that most wants 2×1; thumbnails and item count scale. |
| 3.5 | Remaining cards audited | Some legitimately need nothing — record which and why. |

### Phase 4 — Reordering

The last piece of "dynamic". Kept last because it is the one step that likely forces the
storage shape to change.

| # | Deliverable | Notes |
|---|---|---|
| 4.1 | Order storage | Almost certainly the point at which the two JSON columns become a `dashboard_cards` table (D4). Migration carries one real user + the demo seed. |
| 4.2 | Reorder UI | Settings list reorder first (no new dependency); drag-on-grid only if it can be done without one — see §6. |
| 4.3 | Order + span interaction | Dense packing plus explicit order is the genuinely hard case; may need explicit placement rather than auto-flow. |

### Phase 5 (optional) — Presets

"Wall", "Focus", "Minimal" as named layouts. Cheap once P1–P4 exist, and the best answer to
"this is fiddly to configure". Not scheduled.

---

## 5. Deliverable status

| Phase | Deliverables | Done | Remaining |
|---|---|---|---|
| 0 — Audit & decisions | this document | 8 decisions recorded, prior art catalogued | mirror D1/D2/D5 into the integrations contract |
| 1 — Visibility | 9 | 0 | 1.1 – 1.9 |
| 2 — Sizing | 9 | 0 | 2.1 – 2.9 |
| 3 — Size-aware content | 5 | 0 | 3.1 – 3.5 |
| 4 — Reordering | 3 | 0 | 4.1 – 4.3 |

Pre-existing partial credit, for honesty: `.span-2` (dead) and the settings teaser (a stub
that says the feature is coming). Neither does anything.

---

## 6. Notable gaps

1. **Two cards bypass the `Card` shell** (`NewsCard.tsx:122`, `WeatherCard.tsx:157`). Unhandled,
   sizing is a no-op on two of nine cards and the bug looks like a CSS problem. Resolve in 1.3.
2. **Card internals are tuned for a 1×1 tile** (§2.3). P2 ships bigger cards containing the
   same content; P3 exists to close that, and the interim state should be a conscious
   choice, not a surprise in review.
3. **Reordering may require a drag dependency.** Every serious grid-drag library is a new
   `npm` package, which needs explicit approval per the repo's prime directives. The stated
   preference is native HTML5 drag-and-drop or a settings-list reorder with buttons — no new
   dependency. Unresolved; P4 scope depends on the answer.
4. **Dense auto-flow can reorder cards visually.** `grid-auto-flow: dense` fills holes by
   pulling later cards forward, so DOM order and visual order can diverge. Acceptable in P2
   (order is not user-controlled yet); it becomes a real conflict in P4.3.
5. **No accessibility pass is scheduled.** Toggles and size pickers need keyboard operation
   and sensible labels; a reordering UI needs a keyboard path that is not drag. Should be
   folded into 1.7 and 2.7 rather than bolted on.
6. **Two migrations in short succession** (`0012` visibility, `0013` sizing) that P4 may
   then replace with a table. Accepted deliberately: shipping P1 alone is worth more than a
   tidy migration history, and D4 explains the eventual consolidation.
7. **No test coverage.** The repo has no test suite; verification is typecheck + build +
   live inspection (§7). The budget calculator (2.3) is pure and the one piece that would
   genuinely benefit from a unit test — flag if a test runner is ever adopted.

---

## 7. Blockers

**None block starting Phase 1.** The work is self-contained in this repo.

| # | Blocker | Blocks | Status |
|---|---|---|---|
| B1 | New-dependency approval for any drag library | P4.2 only | Open — ask before P4 is scoped. Preference on record: no new dependency. |
| B2 | Confirmation of D1 (the 3×3 substrate) | P2 onward | **Decided here, pending review.** P1 is substrate-agnostic and can start regardless. |
| B3 | The Homelab card (the tenth card) does not exist yet | Nothing here | Informational. This work is that card's prerequisite, not the reverse. |

Note for sequencing: the integrations contract's Phase 2 (homelab snapshots + events) has
its own prerequisites, and **none of them gate this work**. This ships first, alone.

---

## 8. Verification

Applies to every phase; the phase is not done until all of it passes.

- `pnpm typecheck` across all five workspaces, and `pnpm build` (API dry-run + web Vite build).
- Migration applied locally (`pnpm --filter @central-command/api run db:migrate:local`),
  then `seed:demo:local`; CI applies remote on deploy.
- **Live check at all three widths** — wall (≥1100px, no page scrollbar), 2-column, 1-column —
  in **both themes**.
- **Confirm a demo session cannot `PATCH`** the layout (expect the `demoReadOnly` 4xx).
- P2 additionally: confirm the cell budget cannot be exceeded via the UI, and that a
  hand-crafted over-budget `PATCH` is rejected server-side.

---

## 9. History

| Date | Entry |
|---|---|
| 2026-08-21 | Card visibility scoped as Phase 1 of `integrations/homelab-telemetry.md` (D1 there), sizing explicitly deferred. |
| 2026-08-22 | This document created. Audit of prior art; sizing pulled into scope as Phase 2; substrate decided (D1 here); phases 3–5 added. No code written. |
