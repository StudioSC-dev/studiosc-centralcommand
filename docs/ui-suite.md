# UI Suite — dynamic dashboard layout

**Scope:** per-user control over *which* cards appear on the dashboard and *how large* each
one is, on a uniform cell grid.
**Status:** Phases 0–4 complete (visibility · edit mode · reordering · sizing) · Phase 5 tail open
**Owner branch:** `feat/ui-suite` → `dev`
**Last updated:** 2026-08-23

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

### 2.1 Already implemented *(snapshot taken before Phase 1; §10 records what changed)*

| Thing | Where | Note |
|---|---|---|
| 3×3 viewport-filling grid | `styles.css:681` `.dashboard` | `repeat(3, minmax(0,1fr))` columns × `repeat(3, minmax(0,1fr))` rows, `height: calc(100vh - 56px - 1.8rem - 8px)`. No page scroll — overflow scrolls *inside* cards. |
| Responsive step-down | `styles.css:712`, `:721` | ≤1100px → 2 columns, fixed `--card-h: 440px`, page scrolls. ≤720px → 1 column. |
| `.span-2` class | `styles.css:706` | `grid-column: span 2`, plus a ≤720px override back to `span 1`. **Declared but applied to nothing** — the only pre-existing sizing primitive, and it is dead code. *(Deleted in 4.4.)* |
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
  double the space. **Content that adapts to size is its own phase (P5)** and is explicitly
  not smuggled into P4.
- **The no-scroll invariant is load-bearing.** The wall layout's whole point is that the
  3×3 fits a secondary monitor with no page scroll. Variable spans can break this in a way
  hiding cards cannot, which is why P4 carries a cell-budget rule (D5/D9) rather than
  free-form sizing.
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

### D2 — Grid shape is derived from the visible card count, rows before columns

```
rows = min(3, ceil(count / 3))
cols = min(4, ceil(count / rows))
```

| Cards | Grid | Holes | Tile aspect vs the 3×3 reference |
|---|---|---|---|
| 1 | 1×1 | 0 | 0.98 |
| 2 | 2×1 | 0 | 0.49 |
| 3 | 3×1 | 0 | 0.32 |
| 4 | 2×2 | 0 | 0.99 |
| 5–6 | 3×2 | 1 / 0 | 0.66 |
| 7–9 | 3×3 | 2 / 1 / 0 | 1.00 |
| 10–12 | 4×3 | 2 / 1 / 0 | 0.74 |

**Two corrections, both made while building.**

*First (P1.6):* the contract pinned rows at 3 unconditionally. That leaves an empty band
below seven cards — four cards would render a 2×2 and then a dead third row on a layout
whose entire purpose is filling the viewport.

*Second (browser pass):* deriving **columns** first was also wrong, and worse. Three cards
became a 1×3 — every card the full window width at a third of its height, roughly 6:1
against the ~2:1 tile the cards are designed for. Card contents visibly stretched. The
viewport is a widescreen, so the grid must fill **across** before it fills **down**: three
cards are a 3×1, not a 1×3.

Two properties fall out of the corrected rule and are worth keeping:

- **Rows never exceed 3**, so a tile is never *shorter* than it is in the full 3×3. Vertical
  space only increases as cards are hidden, so hiding a card can never make another card
  start scrolling.
- **No shape is a letterbox.** The worst aspect deviation is a *portrait* tile (3 cards),
  which is the safe direction — it yields empty space, not overflow.

Implemented as `gridShape()` in `routes/index.tsx`. **Mirror this into the contract**, where
the original pinned-rows rule is still on record.

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

The visible cards must fit a grid of at most 4 columns × 3 rows. Over budget is
**prevented** at the size picker (the option is disabled with a reason); under budget is
**allowed** with a hint, because a deliberately sparse wall is a legitimate choice.

This is what keeps "cards can be any size" from quietly reintroducing a page scrollbar on
the wall display.

**Amended by D9 while building**, in two ways. The rule was `sum(width × height) ≤ columns ×
3`, and a sum is not sufficient — it ignores the hole a 2-wide card leaves when it will not
fit in the rest of its row, so it approves layouts that render four rows tall. The budget is
now a *packing* question. And the meter moved from the settings UI to the edit bar, along
with everything else about layout.

### D6 — Server validates, client optimises

The API is the authority: unknown keys rejected, sizes checked against the enum, budget
recomputed server-side. The client toggle is optimistic for feel, but a malformed `PATCH`
never persists. Card visibility is a **preference, never a privacy boundary** — anything
that must not be seen is filtered server-side, independent of layout.

### D7 — Sizing does not change card content in the sizing phase

A resized card gets more space and the same content. Adapting item counts and internal
layout to the available tile is **P5**, deliberately separated so P4 can ship on visual
inspection alone. It held: P4 changed no card's internals, and P5's measuring primitives
needed no retuning for the new tile sizes.

### D9 — No `dense` auto-flow; the shape is chosen to pack instead

**Decided 2026-08-22, during Phase 4.** D5 assumed `grid-auto-flow: dense` would fill the
holes a span leaves behind. Phase 3 invalidated that: dense fills a hole by pulling a *later*
card forward, so the card you just dragged into position lands somewhere else. Order is now
user-controlled and visible, and a layout mode that silently contradicts the gesture that
produced it is worse than a gap. **Dense is off.**

The holes are dealt with at derivation instead. `gridShape()` **packs** the spans — simulating
`grid-auto-flow: row` exactly — and tries each column count from D2's preferred shape up to
four, taking the first that fits in three rows. Counting cells alone would not do: `sum(w×h)
≤ cols×rows` ignores the hole a 2-wide card leaves when it will not fit in the rest of its
row, so it says yes to layouts that are four rows tall.

**A consequence worth stating plainly: position affects fit.** Nine cards with a 2×2 first
pack into a 4×3 wall with zero holes; the same nine with the 2×2 *last* need a fourth row.
The size picker greys out what will not fit from where the card currently sits.

**Three writes, one budget, two policies.** A *resize* that does not fit is refused — the
alternatives are sitting right next to it in the picker, so refusing costs nothing. *Hiding*
and *reordering* are never refused, because "you cannot restore this card until you shrink
another one" is a dead end, and a reorder that fails halfway through a drag is worse than an
ugly grid. Those two may therefore produce an over-budget wall; `gridShape()` always returns
a renderable shape and flags `overflows`, and the edit bar's budget readout says so in words.
This is the "warned not blocked" half of D5, given a precise boundary.

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
| ✅ 1.1 | `user_settings.hidden_cards` JSON column + migration **`0012_flaky_lorna_dane.sql`** | `packages/db` | D4. Nullable TEXT holding a JSON array; `null` → nothing hidden. |
| ✅ 1.2 | `CardKey` union + `DashboardLayout` type | `packages/types` | D3. Single source of truth for the nine keys. |
| ✅ 1.3 | **Card registry** replacing the nine hardcoded JSX tags | `apps/web` | **Keystone.** Split into `cardCatalog.ts` (metadata, no component imports) + `cardRegistry.ts` (key → component). Resolved both hand-rolled shells. |
| ✅ 1.4 | `GET` / `PATCH /api/dashboard/layout` | `apps/api` | User-scoped, validated against `CardKey`, server default when no row exists. `demoReadOnly` already blocks the `PATCH` for demo sessions. |
| ✅ 1.5 | `useDashboardLayout` hook; render registry filtered by layout | `apps/web` | Optimistic toggle; shared `queryOptions` like `settingsQueryOptions`. |
| ✅ 1.6 | Variable-count grid CSS | `apps/web` | D2. `gridShape()` derives rows then cols; passed to `.dashboard` as `--dash-cols` / `--dash-rows`. |
| ✅ 1.7 | Settings toggles section | `apps/web` | Replaces the `.settings-disabled` teaser at `routes/settings.tsx:358`. Where the feature becomes usable rather than merely present. |
| ✅ 1.8 | Demo default layout | `packages/db/seed-demo.sql` | Demo shows all nine. |
| ✅ 1.9 | Verification | — | See §7. |

### Phase 2 — Edit mode (in place, on the dashboard)

Arrangement moved out of Settings and onto the dashboard itself, phone-home-screen style.
**Sequenced before sizing on purpose:** sizing otherwise has no UI home but more Settings
controls, which edit mode would immediately replace — building them would be building them
twice. Edit mode is the surface all three of visibility, sizing and reorder belong on.

| # | Deliverable | Status |
|---|---|---|
| 2.1 | `EditModeProvider` / `useEditMode` above the route; Escape exits; leaving `/` exits | ✅ built |
| 2.2 | Header toggle, dashboard-only, hidden for demo sessions | ✅ built |
| 2.3 | Long-press (500 ms) on a card to enter, as on a home screen | ✅ built |
| 2.4 | `CardKeyContext` so the shared shell knows which card it is rendering | ✅ built |
| 2.5 | Remove badge on each card; jiggle, with a reduced-motion equivalent | ✅ built |
| 2.6 | Edit bar: hidden-card chips to restore, error text, Done | ✅ built |
| 2.7 | Settings "Dashboard cards" section removed | ✅ built |
| 2.8 | `useLayoutError` — failures surface wherever the mutation was fired from | ✅ built |
| 2.9 | Keyboard path for hide/restore verified; live browser pass | open |

**Why the shell hosts the affordances.** The badge and jiggle live in `Card`, not in a
wrapper element around each card. A wrapper would become the grid item, displacing `.card`
from the grid and putting a new layout box between the two — edit mode would then be able to
disturb the grid it exists to edit. Hosting it in the shell means edit mode adds no layout at
all. This is only possible because every card was routed through the shared shell in 1.3.

**Why there is a hidden-card tray.** Hiding a card removes the very thing you would click to
get it back. Without an inventory, hiding is one-way. The bar floats over the grid rather
than occupying a strip, because the grid is sized to fill the viewport exactly and a strip
would reflow every card the moment edit mode opened.

**`CardKeyContext`, not the `pillar` prop.** The nine pillar values and the nine card keys
coincide today. Deriving identity from the accent colour would break silently the first time
they diverge, so the dashboard supplies the key explicitly.

**Open — the settings section is gone.** Layout has one home now. That deletes the 1.7 UI
(the API, types, registry and hook underneath it are untouched), which is why the phase
ordering matters: it was built and removed inside a day.

### Phase 3 — Reordering

Pulled ahead of sizing. **Reorder is strictly simpler before spans exist:** every tile is
1x1, so a move is an index splice. Once cards can be 2x1 or 2x2, reorder has to solve
placement *and* packing together — the hard case the plan had parked at 5.3. Doing it now
solves it once, in its easy form, and sizing then extends a working reorder instead of the
reverse. It also completes edit mode: a jiggling card that will not move is a half-promise.

| # | Deliverable | Status |
|---|---|---|
| 3.1 | `user_settings.card_order` + migration **`0013_calm_sumo.sql`** | built |
| 3.2 | `order` on `DashboardLayout`; shared `resolveCardOrder` | built |
| 3.3 | `PATCH` accepts `hidden` and `order` independently | built |
| 3.4 | `useMoveCard` — visible-list positions spliced back into the total order | built |
| 3.5 | `useCardDrag` — pointer-event drag, no dependency | built |
| 3.6 | Arrow-key reordering on each slot | built |
| 3.7 | Drop-target and picked-up styling; jiggle suppressed while dragging | built |
| 3.8 | Live browser pass — drag, drop, keyboard, persistence across reload | verified |
| 3.9 | Demo seed order | open |

**Bug found in the browser pass (fixed):** drag selected the wrong target because the hit
test measured `grid.children` — which in edit mode are the `.card-slot` wrappers. Those are
`display: contents`, chosen precisely so the card stays the grid item, and such an element
generates **no box**, so `getBoundingClientRect()` returns all zeros. Every tile's centre
computed as (0,0) and the drop target was meaningless. It now measures the `.card` elements,
which are what the grid actually places. Worth remembering as a general trap: `display:
contents` is invisible to every geometry API, so anything that measures must target the
element that is really laid out.

**Second bug, same pass (fixed):** with the hit test corrected, the drop outline tracked
properly but cards still did not move. `cardsFor()` filtered `CARD_REGISTRY`, which always
returns registry order and silently discarded the order it was handed — so the reorder
persisted to `card_order` and was then thrown away at render. It was *correct* in Phase 1,
where order was fixed; Phase 3 invalidated it without changing the signature, so nothing
failed loudly. **Both bugs in this phase were presentational**, and neither was reachable by
the API tests, which stayed green because the server was never wrong. Layout is a render
property and needs a render-level check.

**Blocker B1 is closed, without a dependency.** Native pointer events cover mouse, touch and
pen in one code path, and a uniform 1x1 grid makes "which cell am I over" a hit test rather
than a layout solver — the drop target is the tile whose *centre* is nearest the pointer,
measured from rendered boxes, so it needs no knowledge of the current column count. A library
would also not have supplied the keyboard path, which matters more here than usual: removing
the Settings list took away the only keyboard-operable way to arrange the dashboard, so
arrow-key reordering is a regression fix, not a nicety.

**Order storage follows D4.** `card_order` holds a partial order; keys *absent* from it sort
after those present, in registry order. A card that ships later lands at the end for existing
users with no backfill — the same property `hidden_cards` has. `resolveCardOrder` is shared
between server and client so the optimistic prediction and the persisted result cannot drift.

**`hidden` and `order` are replaced independently.** They are edited by different gestures, so
requiring both on every write would let a reorder clobber a concurrent hide.

### Phase 4 — Sizing (spans)

Depends on the P1 registry (every card in one shell) and on P3 (order is user-controlled, so
packing has to respect it). This is the half the integrations contract explicitly deferred
("size and reorder become a separate follow-up"), pulled forward by this session's scope.

| # | Deliverable | Where | Status |
|---|---|---|---|
| ✅ 4.1 | `user_settings.card_sizes` JSON column + migration **`0014_sticky_vanisher.sql`** | `packages/db` | built. `0013` was taken by `card_order`. |
| ✅ 4.2 | `CardSize` union + `cardSpan()` / `cardSpans()` | `packages/types` | built. `1x1`, `2x1`, `1x2`, `2x2`, `3x1` — closed set (D1). |
| ✅ 4.3 | Packing grid derivation + `fitsGrid` budget check | `packages/types` | built. `gridShape()` moved out of the route; one implementation, three callers. |
| ✅ 4.4 | `.card-w2` / `.card-w3` / `.card-h2` span classes | `apps/web/styles.css` | built. `.span-2` retired. **No `dense`** — see D9. |
| ✅ 4.5 | The shell emits the span class from `CardKeyContext` | `apps/web` | built. Both former hand-rolled shells inherit it via 1.3. |
| ✅ 4.6 | `PATCH` accepts `sizes`; server-side budget validation | `apps/api` | built. D6 — same `fitsGrid` the picker greys options with. |
| ✅ 4.7 | Size picker **in edit mode** + budget readout in the edit bar | `apps/web` | built. Moved off Settings — see below. |
| ✅ 4.8 | Breakpoint collapse rules | `apps/web/styles.css` | built. D8. |
| ✅ 4.9 | Demo seed sizes + verification | — | verified. Demo Weather 2×2 packs 4×3 with zero holes; live pass green on §8. |

**The picker moved from Settings to edit mode**, and the plan above still said "size picker in
settings" because it was written before Phase 2 existed. Building it there would have been
building it to delete it — exactly the trap that made edit mode Phase 2 in the first place. It
now sits on the card next to the remove badge, in the shell, for the same reason that one does.

**The budget calculator went to `packages/types`, not `packages/utils`.** `apps/web` depends on
`types` and not on `utils`, and the layout logic it has to agree with the server about
(`resolveCardOrder`, `CARD_KEYS`, `isCardKey`) is already there. Sending sizing to `utils`
would have meant adding a workspace dependency to split one feature's rules across two
packages. `gridShape()` moved out of `routes/index.tsx` for the same reason: the server needs
it to validate the budget, and D5's whole point is that the meter and the validator are one
function.

**The picker is one row of glyphs, not a labelled list.** `.card` clips to its rounded corners,
so a five-row dropdown would be cut off by the bottom of a short tile — and a short tile is
precisely when someone reaches for a resize control. Each option draws the shape as a
miniature 3×2 cell field, which is faster to read than "2 × 1" and needs no vertical space.

### Phase 5 — Card fit (cross-cutting)

Makes a bigger card *worth* being bigger, and a smaller one still correct. **Partly built
early** (rows 5.1–5.9) because the no-scroll requirement forced it.

**The rule: a card fits its tile — with one deliberate exception.** A wall display nobody is
sitting at cannot be scrolled. **News is exempt**: a feed has no natural end, so no amount of
trimming makes it "fit", and scrolling is what the content is for. It opts out with
`<Card scrollable>`.

**Scale first, drop only as a last resort.** Shrinking type and spacing to fit the tile keeps
every element on the card, which is what the card was designed to show; dropping a block is a
worse outcome and is reserved for when scaling has bottomed out. Scaling is done with
**container query units**: `.card` is a size container (`container-type: size`), so contents
size against *their own tile* rather than the viewport — e.g.
`font-size: clamp(1.5rem, 15cqh, 2.85rem)`. No per-size rules to write, and it keeps working
at whatever tiles the sizing phase introduces.

Below that, two fallback mechanisms, because cards come in two shapes:

- **`useClampList`** thins one list, row by row, hiding rows that don't fully fit
  (Calendar, Tasks, Insights).
- **`useFitSections`** drops whole blocks in a declared order, which is what a *non*-list
  card needs — Weather and Performance are fixed stacks (hero, details, outlook, chart) with
  no list to thin. A card marks optional blocks with `data-drop-order`, lowest dropped first;
  anything unmarked is essential. **The shell owns this**, so the guarantee is not
  re-implemented per card, and a card with nothing marked still scrolls *visibly* — an honest
  scrollbar beats silently clipping a card nobody has audited.

Current drop orders: Weather `outlook → details → sun arc`; Performance `trend chart → resting-HR vitals`.

 The naive implementation is a `slice(0, N)` per
card, and it is wrong — every `N` encodes one tile size, so it is stale the moment the grid
reshapes (P1) or a card is resized (P4). Retuning constants at every size is how the
original overflow bug happened. So the content decides what to show by **measuring**, once,
in a shared primitive.

| # | Deliverable | Status |
|---|---|---|
| 5.1 | `useClampList` — hide rows that don't fully fit, report the count; `ClippedNote` footer | ✅ built |
| 5.2 | Calendar clamped; `MAX_EVENTS` demoted from "what shows" to a DOM ceiling (10 → 30) | ✅ built |
| 5.3 | Tasks clamped — previously rendered **every** task, unbounded | ✅ built |
| 5.4 | Insights clamped — previously rendered **every** insight, unbounded | ✅ built |
| 5.5 | `useFitSections` — the shell drops `[data-drop-order]` blocks until the body fits | ✅ built |
| 5.6 | Weather (outlook → details → sun arc) and Performance (trend → vitals) marked | ✅ built |
| 5.7 | News opted out via `<Card scrollable>` — a feed has no natural end | ✅ built |
| 5.8 | `.card` as a size container; display numerals + hero spacing on `cqh` clamps | ✅ built |
| 5.9 | Fix `.gaming-matches-block` overlap — `min-height: 0` spilled content onto the disclaimer | ✅ built |
| 5.10 | Audit the rest (Health, Gaming, Summary) and scale/mark their blocks | open |
| 5.11 | Size-*aware* content, as opposed to size-*safe*: a 2×2 card using its extra room well | open |

**How the primitive works, and why it is built that way.** Item heights are not uniform — an
insight's detail wraps, the calendar has a divider row, a task row grows while being edited —
so "how many fit" cannot be derived from one row's height. It has to come from each item's
real box. Two consequences:

- **It hides rather than slices.** Slicing in React would unmount the very elements whose
  boxes the next measurement depends on, so the list could never tell that a row would fit
  again once the card grew. Every item stays mounted; `visibility` is toggled.
- **`visibility: hidden`, specifically.** It is the only way to hide an element without
  affecting layout, so toggling it cannot trigger the `ResizeObserver` that scheduled it —
  which is precisely what would loop.
- **The "+N more" footer is always rendered, even at zero**, at a fixed height. If it
  appeared only when something was clipped, it would take space from the list exactly when
  the list was already full — and removing it would free the space that makes the last row
  fit, which removes it again. Reserving the space unconditionally gives the measurement a
  fixed point.

This is why 5.1 was worth building properly instead of tuning three constants: it is correct
at every tile size, so **Phase 4 sizing needed no retuning of it** — and did not get any.

### Phase 6 (optional) — Presets

"Wall", "Focus", "Minimal" as named layouts. Cheap once P1–P4 exist, and the best answer to
"this is fiddly to configure". Not scheduled.

---

## 5. Deliverable status

| Phase | Deliverables | Done | Remaining |
|---|---|---|---|
| 0 — Audit & decisions | this document | 8 decisions recorded, prior art catalogued | mirror D1/D2/D5 into the integrations contract |
| 1 — Visibility | 9 | **9** | — shipped |
| 2 — Edit mode | 9 | 8 | 2.9 (verification) |
| 3 — Reordering | 9 | 9 | — demo seed order settled as "registry order" (4.9) |
| 4 — Sizing | 9 | **9** | — shipped |
| 5 — Card fit | 11 | 9 | 5.10 – 5.11 — **next**; 5.11 (size-*aware* content) is what D7 deferred |

Pre-existing partial credit, for honesty: `.span-2` (dead) and the settings teaser (a stub
that says the feature is coming). Neither does anything.

---

## 6. Notable gaps

1. ~~**Two cards bypass the `Card` shell.**~~ **Closed in 1.3.** Both local shims delegated to
   the shared shell, which gained a `className` passthrough. Their only reason to exist was to
   add `news-card` / `weather-card` classes that **appear nowhere in `styles.css`** — dead
   classes duplicating a shell. Kept on the shared call for future styling, at zero cost.
2. **Card internals are tuned for a 1×1 tile** (§2.3). *Partly closed:* the three unbounded
   list cards (Calendar, Tasks, Insights) now measure instead (3.1–3.4). The remaining cards
   are unaudited — 3.5.
3. ~~**Reordering may require a drag dependency.**~~ **Closed in P3** on native pointer
   events; no package added. See B1.
4. ~~**Dense auto-flow can reorder cards visually.**~~ **Closed in P4 by dropping dense**
   (D9). The conflict was real; the resolution is that the derivation packs instead, and the
   holes it cannot avoid are shown in the budget readout rather than hidden by reflowing
   someone's arrangement.
5. **No accessibility pass is scheduled.** *Partly closed as it went:* reorder has an
   arrow-key path (3.6) and the size picker is a labelled `menuitemradio` group operable by
   keyboard, closing on Escape without also leaving edit mode. What has never been checked
   end to end is the whole flow with a screen reader, and edit mode has no focus trap.
6. **Three migrations in short succession** (`0012` visibility, `0013` order, `0014` sizing)
   which a `dashboard_cards` table would eventually replace with one. Accepted deliberately:
   shipping each phase alone was worth more than a tidy migration history, and D4 explains the
   consolidation. All three columns are nullable and sparse, so that migration is one real
   user plus the demo seed.
7. **No test coverage.** The repo has no test suite; verification is typecheck + build +
   live inspection (§7). The packer and budget check (4.3) are pure and are the pieces that
   would genuinely benefit from a unit test — they were checked instead with a throwaway Node
   harness that replays D2's whole table plus the packing-hole cases. Flag if a test runner is
   ever adopted; that harness is the test, and it is not in the repo.
8. **Card content is still size-*safe*, not size-*aware* (5.11).** A 2×2 card now gets twice
   the room and shows the same six matches, scaled up. That is D7 holding as designed, and it
   is the next thing worth doing.

---

## 7. Blockers

**None block starting Phase 1.** The work is self-contained in this repo.

| # | Blocker | Blocks | Status |
|---|---|---|---|
| ~~B1~~ | ~~Drag library dependency~~ | — | **Closed 2026-08-22.** Reorder shipped on native pointer events; no package added. |
| ~~B2~~ | ~~Confirmation of D1 (the 3×3 substrate)~~ | — | **Closed 2026-08-23.** Four phases shipped on it, spans included; the unit grid held without amendment. |
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
- P4 additionally: confirm the cell budget cannot be exceeded **via the size picker**, and
  that a hand-crafted over-budget `sizes` `PATCH` is rejected server-side — while a *hide* or
  *reorder* that overflows is still accepted and merely warned about (D9).

---

## 9. Phase 1 implementation notes

Written during the build; these are the things a reader of the plan alone would not predict.

- **The registry is two files, not one.** A single `cardRegistry.ts` imported by both the
  dashboard and the settings page put all nine card components on the **settings** bundle —
  it grew from 9.29 kB to pulling a 38.73 kB chunk, to render a list of nine strings.
  `cardCatalog.ts` now holds metadata and imports no components; `cardRegistry.ts` binds
  keys to components and is imported only by the dashboard route. Settings is back to
  9.29 kB + a 1.83 kB catalogue.
- **`CARD_COMPONENTS` is typed `Record<CardKey, ComponentType>`.** Adding a key to the union
  without a component is then a build error, which is the point of D3.
- **Lenient read, strict write.** `parseHiddenCards` drops malformed JSON, non-arrays and
  unrecognised keys rather than throwing, while `PATCH` rejects an unknown key with a 400. A
  key left behind by a card we later remove is history and must not break a dashboard;
  because we store *hidden* keys (D4), dropping an unrecognised one fails safe by **showing**
  a card rather than hiding one. A bad key on the way in is a client bug worth surfacing.
- **`PATCH` replaces the whole hidden set** rather than sending a delta. That makes the
  request idempotent and avoids add/remove races between two open tabs.
- **The dashboard loader awaits the layout**, unlike the settings route's fire-and-forget
  prefetch. The layout decides both the card count and the column count, so rendering early
  means painting the default nine and reflowing the entire grid.
- **The two hand-rolled shells were only ever adding dead classes.** `news-card` and
  `weather-card` appear nowhere in `styles.css`. Both now delegate to the shared `Card`,
  which gained a `className` passthrough. P4's span classes went on the shell itself instead,
  read from `CardKeyContext` — same principle, one fewer thing for a card to pass through.
- **One deliberate visual change:** the News card now renders the `card-dot` accent, because
  the shared shell always does and `--pillar-news` already existed for it. Every other card
  had one; News was the outlier. Revert by giving `Card` a dot opt-out if that reads wrong.
- **A failed layout save is now shown.** The first browser attempt hit a 500 and the only
  symptom was a checkbox that "clicked itself back" — the optimistic rollback with nothing
  explaining it. `DashboardCardsSection` now renders the mutation error. Any optimistic
  toggle needs this; silent rollback is indistinguishable from a dead control.
- **Toggles are not disabled while saving.** The update is optimistic and each `PATCH` sends
  the whole set derived from the already-updated cache, so rapid toggling stays consistent.
- **Local-dev gotcha:** apply migrations **before** starting `wrangler dev`, and never while
  it is running. A running miniflare instance holds D1 state in memory and can flush an older
  snapshot on shutdown — it silently reverted `0012`, dropping both the column and its
  `d1_migrations` row while leaving all other data intact. `SELECT name FROM d1_migrations`
  is the reliable check; the column existing is not, because it can disappear later.

  **It happened again in P4, to `0014`, and presented completely differently.** The dashboard
  rendered perfectly and *reordering* was what broke, with an opaque
  "An unexpected error occurred". The asymmetry is the tell and it is structural: the read
  path degrades a missing column to `undefined → {}` and carries on, while `PATCH` writes all
  three layout columns on every save regardless of which one changed — so the first symptom
  of a reverted migration is a *write* failing, on a gesture unrelated to the migration.
  Expect it to look like a broken feature, not a broken database. `PRAGMA
  table_info(user_settings)` next to the `d1_migrations` query settles it in one command.
- **`.settings-disabled` was deleted** along with the teaser it existed for. `.span-2` is
  still present and still dead — it is retired in 4.4, not here.

---

## 10. History

| Date | Entry |
|---|---|
| 2026-08-21 | Card visibility scoped as Phase 1 of `integrations/homelab-telemetry.md` (D1 there), sizing explicitly deferred. |
| 2026-08-22 | This document created. Audit of prior art; sizing pulled into scope as Phase 2; substrate decided (D1 here); phases 3–5 added. No code written. |
| 2026-08-22 | **Phase 1 built and verified** (1.1–1.9). D2 corrected mid-build: rows are derived, not pinned at 3. Gap 1 closed. Implementation notes in §9. |
| 2026-08-22 | **Reordering built** as Phase 3, ahead of sizing — drag on native pointer events plus arrow keys; B1 closed with no dependency. Sizing -> Phase 4. |
| 2026-08-22 | **Edit mode built** as the new Phase 2, ahead of sizing — arrangement moved onto the dashboard; Settings section removed. Sizing → Phase 3, reorder → Phase 5. |
| 2026-08-23 | **Phase 4 verified** (4.9). Live pass green at all three widths in both themes, spans confirmed on the two former hand-rolled shells, picker limits and the D9 asymmetry exercised, demo session confirmed read-only. B2 closed. |
| 2026-08-23 | The `0012` miniflare trap recurred on `0014` — same cause, unrecognisable symptom (reorder failing while the dashboard rendered). §9 extended with the read/write asymmetry that makes it present as a broken feature. |
| 2026-08-22 | **Sizing built** as Phase 4 (4.1–4.8). D9 added: `dense` dropped, and the grid shape now *packs* spans rather than counting cells — counting says yes to layouts four rows tall. Picker moved from Settings to edit mode; `gridShape()` moved to `packages/types` so the meter and the server validator are one function. Gaps 3 and 4 closed. |
| 2026-08-22 | Browser pass. D2 corrected **again** (rows before columns — column-first made 3 cards a 6:1 letterbox). Cards were scrolling: Tasks and Insights rendered unbounded lists. Built `useClampList` (3.1) and applied it to Calendar, Tasks, Insights rather than tuning per-card constants. |
