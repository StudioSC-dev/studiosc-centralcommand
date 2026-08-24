# UI Suite — dynamic dashboard layout

**Scope:** per-user control over *which* cards appear on the dashboard and *how large* each
one is, on a uniform cell grid.
**Status:** Phases 1–7 complete and verified (visibility · edit mode · reordering · sizing · card fit · presets · user presets) · **contract mirrored** · **Phase 8 complete and verified** (consolidation · `1x3` · the unguarded edges) · nothing outstanding in this document
**Owner branch:** `feat/ui-suite` → `dev`
**Last updated:** 2026-08-24

Companion documents:

- [`../../integrations/homelab-telemetry.md`](../../integrations/homelab-telemetry.md) —
  originating contract. Its **Phase 1 build order (1.1–1.9)** is the same work as this
  document's Phase 1, restated here with the sizing phases the contract deliberately
  deferred. **Decisions recorded here must be mirrored there**, because the homelab side
  reads that file. **Mirrored 2026-08-23** as that file's **D11**, gathered as a single
  decision because it has its own D1–D10 that collide by number with this document's — its D9
  is cloud control, ours is grid packing; its D10 is the Kuma read path, ours is scroll policy.
  **Never cite a `D<n>` by bare number across the two files.**
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

### 2.1 Already implemented *(snapshot taken before Phase 1; §11 records what changed)*

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

**Read this table as cards only while every card is 1×1.** From Phase 4 the shape is driven by
*cells*, not card count, so the counts above are the special case where the two coincide. Nine
cards with one 2×2 is 12 cells and derives a **4×3** — the same shape this table attributes to
ten-to-twelve cards. Confirmed in the browser (hide three, enlarge one, restore the three), and
it reads correctly because 12 cells in a 4×3 is exactly full with no holes.

Implemented as `gridShape()`, which moved to `packages/types` in 4.3 so the server can
validate the cell budget against the same derivation. **Mirror this into the contract**, where
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
migration, no joins, no rows to backfill. It held for all three columns (`hidden_cards`,
`card_order`, `card_sizes`); a `dashboard_cards` table becomes the better shape only if
per-card state keeps growing, and that data migration is one real user plus the demo seed.

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

### D10 — Two cards may scroll; every other card fits, in both axes

**Decided 2026-08-23.** Scrolling is a property of the *content*, not of how a card happens to
be laid out, so it is now a named list rather than a per-card accident:

| Card | Scrolls | Why |
|---|---|---|
| **Today** | yes | A cross-pillar digest with no fixed length — the more pillars report, the longer it gets. |
| **News** | yes | A feed has no natural end (5.7). |
| everything else | **no** | Fits its tile, or thins/drops until it does. |

**Weather is explicitly never scrollable, in either direction.** Its day strip was
`flex: 1 0 auto` inside `overflow-x: auto`, so the chips kept their width and slid off the edge
of a narrow tile. That was invisible at three columns and obvious at four. They now share the
width, and container queries drop whole days when sharing stops being enough — five legible
chips beat five illegible ones.

**Health never scrolls either, and never sheds a control.** Its entry list is the only part
that can give space back, so that is what absorbs a short tile; the quick-add form is fixed,
because it carries the Log button and a submit control you cannot reach is a functional
failure, not a cosmetic one. This is why the fix was a *clamp on the list* rather than
`data-drop-order` marks: dropping blocks would eventually drop the form.

**When a block cannot shrink further, say it in words rather than shrinking it anyway.**
Weather's day strip has a text form — today's rain chance and range, plus the next wetter day
— shown in the two cases the strip cannot serve: the tile is too narrow for legible chips
(container query, 400px), or too short and the fit pass dropped the strip. The text carries the
*highest* drop order, so it is the last thing the card gives up: strip first, sentence in its
place, and only on a smaller tile still does the sentence go too. The swap is keyed off
`.is-dropped` on the strip, so it follows whatever the fit pass already decided rather than
measuring a second time.

**A droppable block must never shrink — the trap under all of this.** `.card-body` is a flex
column, so its children shrink by default rather than overflow. `useFitSections` decides what
to drop by asking whether the body overflows, so a block that quietly compresses hides the very
signal that would have dropped it: the day strip squeezed to half a chip and clipped its own
content while `scrollHeight` still equalled `clientHeight`, and the fit pass concluded
everything fit. It went unnoticed for as long as the strip carried `overflow-x: auto`, which
turned the squeeze into a scrollbar instead of a silent crop. `.card-body [data-drop-order]`
now sets `flex-shrink: 0`, which is what makes the whole drop mechanism observable.

**The general rule this encodes:** when a card must fit, the thing that yields is its
open-ended list, never its controls — and when nothing is left to yield, a block is replaced
by a summary of itself rather than clipped. A card with no list to thin needs either a
`data-drop-order` block (Weather, Performance) or a place on the table above.

### D11 — *deliberately unused in this document*

`D11` is taken, in the **other** file. The mirror of this document's layout decisions lives in
[`../../integrations/homelab-telemetry.md`](../../integrations/homelab-telemetry.md) as **its**
D11(a)–(e), and that file already has its own D1–D10 meaning entirely different things from
ours. Numbering a decision D11 *here* as well would make the one number ambiguous across the
two files that reference each other most — the precise trap the mirror was written to avoid.
So this document skips from D10 to D12. Cite cross-file decisions as `ui-suite D<n>` and
`homelab-telemetry D<n>`, never bare.

### D12 — Presets are constants, and they store the roster

**Decided 2026-08-23, during Phase 6.** Two halves, and the second inverts D4 on purpose.

**Constants, not storage.** The three built-in presets live in `packages/types` as a plain
array. No migration, no fourth column, no endpoint — applying one is a single `PATCH` setting
`hidden`, `order` and `sizes` together, so it inherits the optimistic path, the error surface,
the demo write-block and the server budget check unchanged. This is why Phase 6 was cheap, and
it is the reason *user-defined* presets are a separate phase: those need storage, and the right
storage for them is the `dashboard_cards` table D4 keeps deferring.

**A preset stores `visible`; a user's layout stores `hidden`.** The two need opposite defaults
for the same event — a card that ships later. A user must get it without a backfill (D4); a
preset must *not* silently absorb it, or Minimal grows a card every release. Wall gets both by
naming the live constant (`visible: CARD_KEYS`) rather than spelling out a list, so a tenth card
joins Wall by existing and stays out of the other two. **This is the property the Homelab card
needs**, and it cost nothing.

`visible` is also the order, because position affects packing (D9): the same cards at the same
sizes in a different order can need a fourth row.

### D13 — A saved preset is a row, not a fourth JSON column

**Decided 2026-08-24, at the start of Phase 7.** D4 keeps deferring a
`dashboard_cards` table, and Phase 6 predicted that user presets would be the thing that
finally forces it. On inspection it forces something else, and the distinction is the whole
decision.

**Why not a fourth JSON column.** `user_settings` already carries three
(`hidden_cards`, `card_order`, `card_sizes`), and a `card_presets` column would look like a
fourth of the same kind. It is not. Those three are the *exceptions* to one derived value —
the layout — and they are read and written together, as one thing. A saved preset is a named
entity with its own lifecycle: created, renamed, re-captured, deleted, **one at a time**.
Holding a list of them in a single blob makes every one of those a read-modify-write on
shared state, so two tabs each saving a different preset silently lose one.

**Why not the `dashboard_cards` consolidation either.** That table is per-card layout state,
and a preset is not per-card state — it is a whole arrangement under a name. Doing the
consolidation here would rewrite the layout read path, the optimistic client derivation and
the demo seed, and **would still need this table afterwards**. The two are orthogonal, so the
consolidation stays deferred on its own merits (gap 6) rather than being smuggled in.

So: `card_presets`, one row per saved preset, migration `0015`. Unique on
`(user_id, name)` — names are how the user tells presets apart, and the index is there as
well as the route check because a race between two tabs slips past check-then-insert.

**A saved preset stores the roster, exactly as a built-in does (D12).** It is the same
`PresetArrangement` shape, applied by the same `presetLayoutInput()` and matched by the same
predicate, so there is one implementation of "is this the same arrangement" rather than two
that drift. One consequence is deliberate and is stated in gap 14: nothing a *user* saves can
name the live `CARD_KEYS` constant, so **no saved preset absorbs a card that ships later**.
That is the correct default for an arrangement someone pared down on purpose, and Wall
remains the one preset that grows.

**Applying a saved preset is still not an endpoint.** It resolves to the same single
`PATCH /dashboard/layout` a built-in does (D6), so it inherits the optimistic path, the
shared error surface, the demo write-block and the server-side budget check unchanged. The
only new routes are the ones that manage the rows themselves.

**An arrangement may be stored under exactly one name.** *(Added 2026-08-24, correcting the
first build.)* Two presets describing the same wall are not merely redundant. The chip
highlight answers "which preset is this?", and with a duplicate stored there are two true
answers — so two chips light at once and the control stops reporting a single state.

The first version of this phase accepted the duplicate and lit **every** matching chip, on the
grounds that there was no honest way to pick a winner. That reasoning was right and the
conclusion was wrong: the fix is not to display the ambiguity more truthfully, it is to make
it unstorable. `duplicateArrangement()` refuses a save or a re-capture that would produce a
second preset for the same wall, so the highlight is single-valued **by construction** rather
than by display convention.

**The built-ins are checked too**, because "My Wall" identical to Wall fails in exactly the
same way and neither chip has a better claim. Refusing names the preset in the way, so the
message says which one rather than only that something does.

`matchingSavedPresetIds()` still returns a *list*. The check governs what can be written and
nothing backfills, so a row that predates it — or one from a client that skipped it — must
still highlight rather than be dropped from the comparison. `/layout-lab` flags exactly that
case as `DUPLICATE OF <name>`.

### D14 — `1x3` joins the size set; the union stays closed

**Decided 2026-08-24, during Phase 8.** `CardSize` gains a sixth member, a full-height
column. Carried undecided since Sessions 39–40 and settled here because Phase 8 is the phase
that had nothing else to hide behind.

The union is closed by D1, so every addition has to argue for itself. `1x3` earns it on the
same ground `3x1` did: **it is a shape a 3-column reference grid cannot otherwise express.**
`3x1` is the full-width banner; `1x3` is the full-height column, and with `MAX_GRID_ROWS` at
3 it is the tallest span the grid can hold — it always reaches both edges of the wall. Nothing
between those two is missing: `1x2` and `2x2` already cover "tall" and "big".

It cost what the phase list predicted — one union member, one span entry, one CSS class and
one breakpoint line — plus one thing it did not: **the size picker's glyph had to grow a row.**
It was a 3×2 cell field, which cannot draw a 3-tall span, and would have drawn `1x3`
identically to the `1x2` sitting next to it in the same menu. It is now 3×3, the full reference
wall, so every member of the union is drawn at its true proportions.

**What does not change:** `fitsGrid`, the packer and the budget readout take the new size
without amendment, because they only ever read `cardSpan()`. The lab goes from 45 tiles to 54
by iterating `CARD_SIZES`, and no preset uses it — a built-in adopting a full-height column
would be a separate decision about what those three presets are *for*.

### D15 — The layout is rows, not three JSON columns

**Decided 2026-08-24, during Phase 8.** `user_settings.hidden_cards` (0012), `card_order`
(0013) and `card_sizes` (0014) are replaced by a `dashboard_cards` table keyed on
`(user_id, card)`, with `hidden`, `position` and `size` columns. Migration `0016` creates it,
backfills from the three columns, and drops them — in that order, in one migration, so the
layout never exists in neither place.

This is gap 6 closed, and it is worth saying why it is being done **now**, when Phase 7
explicitly declined to be the thing that forced it. It was declined then because presets are a
different problem — a named entity with its own lifecycle, which is a table for reasons that
have nothing to do with the layout (D13). Doing it here is the opposite case: no feature
needs it, so it can be done as the pure storage change it is, with **no user-visible
difference at all**. That is the only condition under which this is a good migration to write,
and Phase 8 is the first phase where it holds.

**The rule the consolidation had to preserve is D4, and it does.** A card with no row is
visible, at `1x1`, in registry order — so a card that ships later still needs no backfill.
That is what makes `position` **nullable and sparse rather than a dense `0..n`**: keys that
carry one sort by it, keys that do not fall in afterwards in registry order, which is exactly
what `resolveCardOrder()` already did to a partial JSON array. Rows are only written for cards
that are hidden, moved or resized.

**One behaviour genuinely improves, and it is small.** The old `card_order` column stored the
full nine-key array after *any* PATCH, including one that changed nothing about the order — so
every user who had ever touched their layout carried a frozen copy of the default. Positions
are now written only when the order actually differs from registry order.

**Three things this buys beyond tidiness:**

1. **One write path instead of three.** Every layout `PATCH` rewrote all three columns
   regardless of which had changed (§9 — the asymmetry that made a reverted `0014` present as
   a broken *reorder*). It is now one delete + insert, batched into a single D1 transaction.
2. **Leniency collapses.** Three near-identical lenient JSON readers, each re-deriving "is
   this still a card we ship?", become two guards applied once in `rowsToLayout()`. Lenient in,
   strict out is unchanged.
3. **Two tabs cannot clobber each other on a blob.** The composite key makes a per-card write
   expressible, which a shared JSON string never was.

**What is deliberately *not* done:** the write is still a full replace, not a per-card diff. A
layout `PATCH` already carries the complete set it wants — that is what makes it idempotent
(§9) — and turning it into a diff would trade that away for nothing.

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
| ✅ 1.9 | Verification | — | See §8. |

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
| ✅ 2.9 | Keyboard path for hide/restore verified; live browser pass | **closed 2026-08-23 as not required.** Browser pass done; a dedicated keyboard-only walkthrough was considered and declined — single-user wall display, and the controls are real buttons with labels. Not a deferred task. |

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
placement *and* packing together — the hard case the plan had parked for later. Doing it now
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
| ✅ 3.9 | Demo seed order | settled in 4.9 — registry order *is* the demo arrangement; storing it would freeze a default that is already correct. |

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

**The rule: a card fits its tile — with two deliberate exceptions.** A wall display nobody is
sitting at cannot be scrolled. **News and Today are exempt** (D10): a feed has no natural end
and a cross-pillar digest grows with the number of pillars reporting, so no amount of trimming
makes either "fit", and scrolling is what that content is for. Both opt out with
`<Card scrollable>`. Everything else fits in **both axes** — the horizontal half went unnoticed
until four-column tiles made Weather's day strip slide off its own edge.

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
| 5.7 | News — and later Today — opted out via `<Card scrollable>` (D10) | ✅ built |
| 5.8 | `.card` as a size container; display numerals + hero spacing on `cqh` clamps | ✅ built |
| 5.9 | Fix `.gaming-matches-block` overlap — `min-height: 0` spilled content onto the disclaimer | ✅ built |
| ✅ 5.10 | Audit the rest (Health, Gaming, Summary) and scale/mark their blocks | verified in-browser |
| ✅ 5.11 | Size-*aware* content, as opposed to size-*safe*: a 2×2 card using its extra room well | News (paging) and Gaming (clamping) done — every list card now measures |

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

#### 5.11 — News: the first size-*aware* card

**Symptom that started it:** a News card grown to 2×2 still showed five headlines, with the
pager stranded mid-card and dead space beneath it. The cause was `PER_PAGE = 5` — precisely
the `slice(0, N)` this phase exists to reject, sitting in the one card that had opted out of
fit (5.7) and therefore never met the primitive that would have caught it.

**The page now ends where the tile ends.** `.news-list` fills the space between the tabs and
the pager and clips (`flex: 1 1 0; min-height: 0; overflow: hidden` — the shape `useClampList`
requires), the clamp reports how many rows do not fit, and the page size is what is left. No
constant, no retuning, correct at every tile size and at every breakpoint.

**Offsets, not page indices — the part worth remembering.** Once page size is measured it
changes when the card is resized, and a page *index* under a variable page size points at
different content each time: resize a News card and "page 3" silently becomes a different three
articles. An offset is an item, so the page keeps starting at the headline it started at and
simply shows more or fewer. "Back" needs a stack rather than a subtraction, because the
previous page's size may differ from this one's. The readout says `1–5 of 23` for the same
reason — a page *count* is not a fixed quantity any more.

**Two edges handled:** a tile too short for even one headline would measure everything as
clipped and give a page size of zero, so "next" would advance by nothing and strand the reader
— floored at one, which then clips visibly rather than lying. And the rendered window is
deliberately independent of the measured count (render from the offset up to a DOM ceiling of
30, same demotion `MAX_EVENTS` got in 5.2); making it depend on the measurement would be a
feedback loop.

**Resolved by D10:** News keeps `scrollable`, now as a deliberate policy rather than a
leftover — it and Today are the two cards allowed to scroll, and everything else must fit.

#### 5.11 — Gaming: the same problem, the other shape

**Two shapes, two answers.** News has a pager, so measuring gives it a *page size*. Gaming is a
"recent N" list with no pager, so measuring gives it a *row count* — the clamp already built
for Calendar, Tasks and Insights (5.1–5.4), plus the `+N more` footer. `filtered.slice(0, 6)`
is gone; `MAX_MATCH_ROWS = 30` replaces it as a DOM ceiling, not a display count.

**The match list stopped scrolling.** `.gaming-matches` carried `overflow-y: auto`, which
quietly exempted this card from the no-scroll rule — 6 matches in a short tile scrolled inside
the list. It now clips, and the footer says what did not fit, which is what every other list
card does.

**The recent-form summary stayed on the full queue, deliberately.** `RecentForm` reads every
match in the queue, not the visible ones. Its docstring said "from the visible matches", which
was already untrue and would have become a trap: with a measured row count, a summary tied to
what is on screen would change its win rate when the card was resized. A statistic that moves
because a tile got taller is one nobody can trust. Comment corrected to say why.

#### A latent bug in the primitive, found by applying it

`useClampList` held its element in a `useRef`. Mutating a ref does not re-run an effect, so when
a card renders its list **conditionally** — a League queue with no games, a calendar with
nothing upcoming, a news tab with no headlines — the observers stayed bound to the previous,
detached node. Switch away from an empty tab and back, and nothing fired again: `clippedCount`
froze at its last value, so the list either showed a stale `+N more` or silently truncated with
none at all.

It is now a **callback ref backed by state**, so the effect follows node identity, and an
unmounted list resets the count instead of leaving a stale one behind. Gaming's queue tabs are
what exposed it, but the bug was already live in Calendar, Tasks and Insights — it just needed
an empty-then-refilled list to show itself, which those cards reach less often.

### Phase 6 — Presets

Named arrangements applied in one gesture. Cheap once P1–P4 exist, and the best answer to
"this is fiddly to configure": building the Focus wall by hand is four hides, three resizes
and a drag — seven round trips, with the size picker refusing options along the way because
the *order* is not right yet (D9). One button is the whole arrangement, as a single `PATCH`.

| # | Deliverable | Where | Status |
|---|---|---|---|
| ✅ 6.1 | `LayoutPreset` type + `LAYOUT_PRESETS` (Wall · Focus · Minimal) | `packages/types` | built. **No migration** — see D12. |
| ✅ 6.2 | `presetLayoutInput()` — a preset as a PATCH body | `packages/types` | built. Derives `hidden` from the live `CARD_KEYS`. |
| ✅ 6.3 | `matchingPresetKey()` — which preset the layout *is* | `packages/types` | built. Without it the control is write-only. |
| ✅ 6.4 | `useApplyPreset` — apply, plus `snapshot()` for undo | `apps/web` | built. Rides the existing layout mutation; no new endpoint. |
| ✅ 6.5 | Preset row in the edit bar, with active state and Undo | `apps/web` | built. |
| ✅ 6.6 | `PresetGlyph` — the arrangement drawn at its real derived shape | `apps/web` | built. |
| ✅ 6.7 | Preset audit in `/layout-lab` | `apps/web` | built. Asserts fit, zero holes, round-trip, rows ≤ 3. |
| ✅ 6.8 | Verification | — | **verified 2026-08-24.** Typecheck + build + harness green; full §8 live pass walked — all three presets, active state, Undo (including its drop on hand-edit), the cell readout, chip alignment, the wrapped tray at 7 hidden cards, three widths, both themes, lab audit green, demo locked out. |

**No API change, and no migration — this is the whole point of the phase being cheap.** A
preset is not a new kind of state; it is one `PATCH` that happens to set `hidden`, `order` and
`sizes` together. It therefore inherits the optimistic path, the shared error surface
(`useLayoutError`), the demo write-block, and the server-side budget check for free. That last
one is not incidental: the budget check only fires when the body carries `sizes` (D9's
asymmetry), and a preset always does — so **applying a preset is validated where a hide or a
reorder is not**, which is the correct side of that line for a write that sets everything at
once.

**The alternative considered and rejected:** a `preset` field on the wire, so the server
resolves the name itself. It reads cleaner and would make the server the authority on what
"Focus" means (D6). It was rejected because the preset table lives in `packages/types`, which
both sides already import — the two cannot drift — and sending the resolved fields keeps the
optimistic path byte-identical to every other layout write instead of adding a second one.

#### 6.1 — Presets store the roster, not the exceptions

**This inverts D4, deliberately, and it is the only decision in the phase that is not obvious.**

A *user's* layout stores what they have hidden, so a card shipped later appears without a
backfill. A *preset* must do the opposite: it stores `visible`, and `hidden` is derived by
subtracting from the live `CARD_KEYS`.

The two need opposite defaults for the same event. When the Homelab card ships:

- If a preset stored `hidden`, the new card would appear in **every** preset — including
  Minimal, whose entire premise is being small. A "Minimal" that grows a card every release is
  not minimal.
- Storing `visible` means a new card appears in **no** preset — which is wrong for Wall.

Both are had at once by letting Wall name the constant rather than spell out a list:
`visible: CARD_KEYS`. A tenth card joins Wall by existing, and stays out of Focus and Minimal
until someone puts it there. **That is exactly the split the Homelab card needs**, and it costs
nothing.

`visible` doubles as the order, because the array *is* the arrangement. That matters more than
it looks: packing depends on position (D9), so the same cards at the same sizes in a different
order can need a fourth row. Focus's two 2×2s must lead.

#### 6.2 — The presets, and why these three

| Preset | Cards | Shape | Cells |
|---|---|---|---|
| **Wall** | all nine, 1×1 | 3 × 3 | 9/9 |
| **Focus** | Today 2×2 · Calendar 2×2 · Tasks 2×1 · Weather 2×1 | 4 × 3 | 12/12 |
| **Minimal** | Today 2×2 · Weather 1×2 | 3 × 2 | 6/6 |

**All three pack with zero holes.** That is a requirement, not a coincidence: a preset is a
promise that one click produces a *good* wall, and one that leaves dead cells undercuts the
only reason to offer it. It is asserted in `/layout-lab` (6.7) rather than trusted.

**Wall is exactly the shipped default** — no hidden, registry order, no sizes — so it doubles
as "put it back" without a separate Reset control. Asserted too.

#### 6.3 — Undo, and why only this gesture needs one

Applying a preset is the **only** edit-mode gesture that discards an arrangement wholesale.
Every other one — hide, restore, resize, reorder — acts on a single card and is undone by
repeating it. So the preset row is the one place where "that wasn't what I meant" has no way
back, and it carries an explicit Undo holding the layout as it was.

The snapshot is dropped the moment `matchingPresetKey()` returns null — i.e. as soon as the
user edits anything by hand. Past that point "Undo" would revert edits it never made, which is
worse than not offering it.

#### 6.4 — The glyph is a real grid, not an icon

The first version reused the size picker's 3×2 filled-cell field, and **could not tell Wall
from Minimal** — both fill it completely. What distinguishes presets is not how much of the
grid is used but *where the card boundaries fall*.

It is now one block per card on a real CSS grid at the preset's own derived shape, with
placement left to `grid-auto-flow: row`. That is not laziness — it is the same non-dense row
packing `gridShape()` simulates (D9), so the picture is produced by the mechanism it depicts
and cannot drift from it. Change a preset and its glyph follows.

#### Two things found while building this

- **The long-press into edit mode was never demo-gated.** The header toggle has been hidden for
  demo sessions since 2.2, but the 500 ms long-press (2.3) was not — so a demo visitor could
  hold a card, enter edit mode, and meet a set of controls that can only 4xx. Pre-existing, and
  fixed here rather than left, because presets put three of the most inviting buttons in the app
  behind that same door. `canEdit` now requires `!demo`.
- **The edit bar could not wrap.** `.edit-bar-inner` was a non-wrapping flex row and
  `.edit-bar-list` took its max-content width, so a full hidden tray pushed the bar past its own
  `max-width` and off the screen. It had never come up because hiding seven cards took seven
  deliberate clicks — **Minimal now does it in one**, which is a state presets create rather
  than merely expose.

### Phase 7 — User-defined presets

Saving the arrangement on screen under a name of your own. **This is the one phase that needs
storage** — the three built-ins are constants, which is why Phase 6 was cheap and this one is
not. The storage decision is D13: a `card_presets` **table**, not a fourth JSON column and not
the `dashboard_cards` consolidation, which turns out to be a different problem.

Everything else is reuse. A saved preset is the same `PresetArrangement` a built-in is, so it
is applied by the same `presetLayoutInput()`, matched by the same predicate, drawn by the same
glyph and audited by the same lab code. **Applying one is still `PATCH /dashboard/layout`** —
the new routes manage rows, never the layout.

| # | Deliverable | Where | Status |
|---|---|---|---|
| ✅ 7.1 | `card_presets` table + migration `0015_quiet_iron_lad.sql` | `packages/db` | built. Unique on `(user_id, name)`. Applied locally; CI applies remote on deploy. |
| ✅ 7.2 | `PresetArrangement` extracted; `LayoutPreset` now extends it | `packages/types` | built. This is what makes a saved preset free everywhere downstream. |
| ✅ 7.3 | `SavedPreset`, `layoutArrangement()`, `matchingSavedPresetIds()`, `normalisePresetName()`, `SAVED_PRESET_LIMIT`, `PRESET_NAME_MAX` | `packages/types` | built. `matchingPresetKey()` refactored onto the shared `layoutMatchesArrangement()`. |
| ✅ 7.4 | `services/presets.ts` — lenient read, roster-scoped sizes, row → wire | `apps/api` | built. Lenient in / strict out, matching `services/dashboard.ts`. |
| ✅ 7.5 | `GET`/`POST /dashboard/presets`, `PATCH`/`DELETE /dashboard/presets/:id` | `apps/api` | built. Non-empty roster + `fitsGrid` enforced; 409 on duplicate name and on the limit; id lookups scoped by user. |
| ✅ 7.6 | `lib/presets.ts` — query, save, re-capture, delete, `useSavedPresetState` | `apps/web` | built. Delete optimistic, save not — see below. |
| ✅ 7.7 | Saved chips, `+ Save` form, re-capture, armed delete in the edit bar | `apps/web` | built. Separate labelled group from the built-ins. |
| ✅ 7.8 | Saved-preset audit in `/layout-lab` | `apps/web` | built. Asserts fit and round-trip; **holes reported, not failed** — see below. |
| ✅ 7.10 | `duplicateArrangement()` — one wall, one name | `packages/types` · `apps/api` · `apps/web` | built **2026-08-24, after review**. Refused server-side, greyed out client-side, asserted in the lab. Built-ins included. |
| ✅ 7.9 | Verification | — | **verified 2026-08-24.** Typecheck + build + local migration green; full §8 live pass walked, including every Phase 7 addition — the save round-trip, all five refusals, the single-highlight rule across every preset, the armed delete, re-capture's three states, Undo across two presets, `Escape` in the name field, the bar at eight presets, one column, the lab audit, and the demo lockout on all three verbs. |

#### 7.1 — Which writes are optimistic, and why they differ

Every layout write in Phases 1–6 is optimistic, because a card that appears or vanishes a
request later feels broken. The preset rows do not all follow that rule, and the split is
deliberate:

- **Save is not optimistic.** The server assigns the id, and the two failures that matter —
  a duplicate name and the eight-preset limit — are things only the server can settle. A chip
  that appears and then vanishes with an error is worse than one that appears a moment later.
- **Delete is optimistic.** There is nothing the server can say that the client does not
  already know, and a chip that lingers after being dismissed reads as a failed click.

#### 7.2 — Delete arms; it does not fire

The delete `×` is fused onto the chip, a few pixels from a button whose entire job is the
*non*-destructive click. It is also the only destructive control anywhere in edit mode. So the
first click arms it (`Delete?`) and the second confirms; blurring disarms. Deleting does not
touch the layout — the arrangement stays on screen, it just stops having a name. Anything else
would make delete a destructive gesture on the thing the user is looking at.

#### 7.3 — The saved audit drops one assertion on purpose

A built-in preset must pack with **zero holes** — that is a promise the project makes about
what one click produces (6.2). A saved preset is a promise the *user* made to themselves, and
a deliberately sparse wall is a legitimate choice (D5). So `/layout-lab` reports holes for
saved presets as a number rather than a failure. What still has to hold is unchanged: it
**fits** (or the chip would only fail when applied) and it **round-trips** (or it would never
light its own chip).

#### 7.4 — Save is blocked where the endpoint would refuse

The live layout is *allowed* to overflow: restoring a hidden card must never be refused, so
hides and reorders are warned about rather than blocked (D9). A preset is the opposite — the
server will not store an arrangement that does not fit, because the alternative is a chip that
only fails at apply time. `+ Save` and the re-capture button therefore carry the same
`fitsGrid` gate the size picker greys options out with, so a disabled control and a rejected
write cannot disagree. The reason is in the tooltip rather than the control being hidden: one
that vanishes at the limit reads as a bug, one that says why reads as a rule.

#### 7.5 — One wall, one name

The duplicate check is the same shape as the fit check above it: enforced on the write, where
it can actually hold, and mirrored into the control's disabled state so the button never
offers a click that 409s. `+ Save` greys out with the offending preset named in its tooltip,
and the re-capture button disappears when the current arrangement belongs to a *different*
preset — excluding the one being re-captured, since matching itself is what re-capture means.

`/layout-lab` asserts it as well, because the write check cannot reach a row written before it
existed. That assertion is saved-preset-only: the three built-ins are hand-checked constants
and are already known to differ.

#### Two things found while building this

- **The preset row's labels had nothing to hide behind at one column.** The ≤720px rule from
  Phase 6 hid `.preset-chip` and the separator but not the `Presets` label or its list, so the
  narrow layout carried a heading over an empty row — which reads as a row that failed to load
  rather than one deliberately withheld (D8). Pre-existing; fixed here because Phase 7 would
  have added a second dangling label beside it.
- **`Escape` in the name field would have left edit mode.** The window-level `Escape` handler
  (2.x) is the way out of the mode, and it would have fired while the user was mid-word in the
  save field, discarding the name. The field stops propagation, so `Escape` closes the field
  and only the field.

### Phase 8 — Consolidation and the unguarded edges

**The first phase with no new feature in it.** Phases 1–7 each added a capability; this one
pays down three things they left behind, chosen together because none of them is worth a phase
alone and all three are cheap while the context is fresh. Nothing here changes what the
dashboard can do — the one addition a user can see is a sixth size.

There was **no Phase 8 on record** when this work started: the document closed at Phase 7 with
nothing outstanding, and the four candidates were listed in `HANDOVER.md` in rough order of
readiness. Three were taken; **the Homelab card was deliberately left out** and stays the next
piece of work, unblocked, with its prerequisites named in the contract's D11(e)–(f).

| # | Deliverable | Where | Status |
|---|---|---|---|
| ✅ 8.1 | `1x3` in `CardSize`, `CARD_SIZES` and `CARD_SIZE_SPANS` (D14) | `packages/types` | built. Appended, not slotted in — the array *is* the picker's order. |
| ✅ 8.2 | `.card-h3` + its ≤720px collapse; size glyph 3×2 → 3×3 | `apps/web` | built. The glyph bump is the part the estimate missed. |
| ✅ 8.3 | `dashboard_cards` table + migration `0016_dashboard_cards.sql` (D15) | `packages/db` | built and **applied locally 2026-08-24**. Creates, backfills, then drops — one migration. Rewritten twice around D1 limits; see 8.2. |
| ✅ 8.4 | `rowsToLayout()` / `layoutRows()` / `readLayout()` / `writeLayout()` | `apps/api` | built. The two pure halves are separate from the query on purpose (gap 7). |
| ✅ 8.5 | `GET`/`PATCH /dashboard/layout` on rows; `SettingsInput` loses three fields; demo seed rewritten | `apps/api` · `packages/db` | built. No wire change — the endpoint's request and response are byte-identical. |
| ✅ 8.6 | `arrangementOmits()` + the roster count on a saved chip (gap 14) | `packages/types` · `apps/web` | built. |
| ✅ 8.7 | Re-capture arms before it fires (gap 16) | `apps/web` | built. Shares one arming slot with delete. |
| ✅ 8.8 | Rename in the preset UI (gap 15), on a shared `PresetNameField` | `apps/web` | built. No API change — `PATCH /presets/:id` already took `name`. |
| ✅ 8.9 | `scrollable`'s two reasons written down (gap 9) | `apps/web` | built. A comment change, and the right one — see below. |
| ✅ 8.10 | Verification | — | **verified 2026-08-24.** Typecheck + build green; `0016` applied and its backfill confirmed row-by-row; demo re-seeded; full §8 live pass walked, Phase 8 additions included — the 54 lab tiles, the migration round-trip, `1x3` at every width, rename, the shared arming slot and the roster count. |

#### 8.1 — Why the consolidation is a good idea now and was a bad one in Phase 7

Phase 7 twice declined to be forced into this table, and was right to. A preset is a named
entity with a lifecycle — created, renamed, deleted, one at a time — and it is a table for
reasons that have nothing to do with the layout (D13). The layout is the *exceptions to one
derived value*, which is a genuinely different shape, and consolidating it as a side effect of
shipping presets would have coupled two migrations that share nothing but a release.

Doing it in a phase where **no feature needs it** is what makes it safe: there is no
user-visible difference to get wrong, so the only thing that can fail is the migration itself,
and that is a thing that can be checked directly. The full rationale is D15.

#### 8.2 — The migration, and the D1 trap that rewrote it three times

Everything else in this phase is additive or cosmetic. `0016` is not: it **drops three columns**
after backfilling them, and there is no second migration to fall back to.

Two properties keep that honest. It is **one migration**, so the backfill and the drops are one
unit — there is no window in which the layout exists in neither place. And the backfill is **as
lenient as the code it replaces**: every read of a stored blob is guarded by `json_valid`,
because `parseHiddenCards` and friends always degraded malformed JSON to a default rather than
throwing, and a migration that failed on a row the app tolerated would be a strictly worse
reader than the thing being retired.

**The backfill deliberately contains no `json_each`, and this is the finding of the phase.**

The obvious way to read a JSON array into rows is
`FROM user_settings s, json_each(s.hidden_cards)`. It was written that way, and it fails on D1
with `malformed JSON: SQLITE_ERROR`. What makes it a trap rather than a bug is the asymmetry:

- `SELECT … FROM user_settings s, json_each(s.card_order) j` — **works**, returns the right rows.
- `INSERT INTO t (…) SELECT` *the identical query* — **fails.**

**D1 rejects any write whose SELECT correlates a table-valued JSON function to an outer table.**
Confirmed against the local D1 across every form that would normally pin the join order —
`CROSS JOIN`, a subquery with the `json_valid` filter pushed inside, and a
`WITH … AS MATERIALIZED` CTE — all fail identically. `CREATE TABLE … AS SELECT` fails too, so it
is the write, not the `INSERT`. Scalar JSON functions (`json_valid`, `json_extract`) are
unaffected and work in writes without complaint.

That is worth carrying beyond this migration: **a `json_each` backfill that reads correctly in a
`SELECT` proves nothing about whether it will run.** Test the write.

The second form — `SELECT 'weather' UNION ALL SELECT 'summary' …` for the nine keys — hit
**D1's compound-SELECT term limit** at nine terms. The third form ships: a **recursive CTE**
splitting a comma-separated literal, which is what `seed-demo.sql` already does for its date
sequence, cross-joined against `user_settings` with scalar JSON per key.

Spelling the nine keys out has a virtue the `json_each` version did not: the backfill writes
rows only for cards the app actually ships, which is exactly what the lenient read path did
anyway.

**One consequence to know about the data.** `position` is backfilled as the `instr()` byte
offset of the quoted key inside the stored order, not as an array index — deriving the true
index without `json_each` would have cost far more than it is worth. The offsets increase with
array index, so the sort order is identical, and D15 defines `position` as a sparse *sort key*
whose absolute values carry no meaning. The real user's row came through as
`2, 12, 22, 29, 40, 48, 57, 66, 77` — registry order, exactly as stored. The first layout write
normalises it to a dense `0..n` through `layoutRows()`, and in that user's case to nothing at
all, since their order *is* registry order (the frozen-default case D15 describes).

**§9's miniflare trap applies here more than anywhere.** It has already bitten `0012` and
`0014`, and a reverted `0016` would present as a dashboard that has forgotten its layout — the
*legible* failure, unlike the two before it. It was applied with no `workerd` process running
and confirmed with `SELECT name FROM d1_migrations`, not by looking at the table.

**A note on the first, failed run:** it rolled back completely. `0016` was not recorded, the
table was not created, and all three columns were still present — so the retry started from a
clean state rather than a half-migrated one. Worth knowing that D1 gives that guarantee, and
worth confirming rather than assuming next time.

#### 8.3 — Re-capture and rename, and why one arms and the other does not

Gap 16 named re-capture the one unguarded destructive write in Phase 7: it overwrites the
stored arrangement with what is on screen, the previous one is gone, and Undo does not reach
it. It is now the same two-step delete has been since 7.2 — first click arms (`Replace?`),
second confirms, blur disarms — and the two **share one arming slot**, so reaching for either
disarms the other and only one control on a chip can be mid-gesture at a time.

Gap 15's rename is the phase's one added affordance, and it reverses a Phase 7 judgement.
Rename was left out to keep the chip off a third fused button. That was the wrong trade: the
workaround it left behind is **delete-then-save**, which destroys a saved arrangement to change
a label — precisely the class of detour the arming above exists to prevent. So the chip carries
a third button, and the two rarely-used ones are icons.

**Rename does not arm**, because nothing is lost by renaming; it swaps the chip for a field
rather than firing. That field is now shared with `+ Save` as `PresetNameField`, which is not
tidiness: both writes are validated by the same `normalisePresetName` and refused by the same
per-user uniqueness rule, so two fields could have disagreed about which names are offerable.
The only real difference is which names count as taken — a rename must exclude its own — and
that is the parameter.

#### 8.4 — Gap 14 is a UI sentence, not a mechanism

A saved preset stores its roster and nothing backfills it, so a card that ships later is absent
from every one of them. That is the **correct** default (D12/D13) and is not being changed —
Wall is the escape hatch and is the one preset that names the live constant. What was wrong is
that nothing in the UI admitted it.

A saved chip now shows `n/9` when its roster is short of the live `CARD_KEYS`, and the `Saved`
label's tooltip says the rule. Counted against the live constant rather than against whatever
was current when the row was written, because that is not recorded anywhere — and it is
deliberately a **count, not a warning icon**: the preset is not broken, it simply does not
include everything.

Today this reports nothing on most walls, because no card has shipped since. It is written now
so that the day the Homelab card lands, the surprise has already been described.

#### 8.5 — Gap 9 was a documentation bug, not a code one

`scrollable` looked inert on News: the list clips and pages against a measured size (5.11), so
the body has nothing left to scroll. The temptation was to drop the flag.

That would have been wrong, and the reason is the more useful half of this gap. The flag does
**two** things — it opts the body out of `useFitSections` *and* lets it scroll — and the two
exempt cards want them in different proportions:

- **Today genuinely scrolls.** Nothing in it is droppable and its content has no fixed extent.
- **News manages its own fit.** What it needs is the *other* half: the shared drop pass keeping
  its hands off a card that is already deciding for itself how much to show. Two mechanisms
  competing over one body is exactly how the Weather regressions happened (§10).

So the flag stays, on both cards, and what changes is that D10's one-line reason is replaced by
the two real ones — in `CardProps`, in `styles.css`, and in the lab's report legend. Dropping
`scrollable` from News would also have moved nine tiles from "exempt" to "measured" with no
browser available to walk them, which is a change worth making deliberately or not at all.

---

## 5. Deliverable status


| Phase | Deliverables | Done | Remaining |
|---|---|---|---|
| 0 — Audit & decisions | this document | 10 decisions recorded, prior art catalogued | — **closed 2026-08-23**; mirrored into the contract as its **D11** (see below) |
| 1 — Visibility | 9 | **9** | — shipped |
| 2 — Edit mode | 9 | **9** | — shipped |
| 3 — Reordering | 9 | 9 | — demo seed order settled as "registry order" (4.9) |
| 4 — Sizing | 9 | **9** | — shipped |
| 5 — Card fit | 11 | **11** | — shipped; verified across all 45 card×size tiles in the lab (§10). `1x3` (D14) takes that to 54, unwalked — see 8.10 |
| 6 — Presets | 8 | **8** | — shipped and verified (§8 walked 2026-08-24) |
| 7 — User presets | 10 | **10** | — shipped and verified (§8 walked 2026-08-24) |
| 8 — Consolidation & edges | 10 | **10** | — shipped and verified (§8 walked 2026-08-24) |

Pre-existing partial credit, for honesty: `.span-2` (dead) and the settings teaser (a stub
that says the feature is coming). Neither does anything.

---

## 6. Notable gaps

1. ~~**Two cards bypass the `Card` shell.**~~ **Closed in 1.3.** Both local shims delegated to
   the shared shell, which gained a `className` passthrough. Their only reason to exist was to
   add `news-card` / `weather-card` classes that **appear nowhere in `styles.css`** — dead
   classes duplicating a shell. Kept on the shared call for future styling, at zero cost.
2. ~~**Card internals are tuned for a 1×1 tile**~~ (§2.3). **Closed.** The three unbounded list
   cards measure (5.1–5.4); the rest were confirmed in `/layout-lab`, at 45 tiles when Phase 5
   closed and again at **54** once `1x3` landed (D14). Every card is now audited at every size
   it can take, which is the strongest form this gap could be closed in without a test runner.
3. ~~**Reordering may require a drag dependency.**~~ **Closed in P3** on native pointer
   events; no package added. See B1.
4. ~~**Dense auto-flow can reorder cards visually.**~~ **Closed in P4 by dropping dense**
   (D9). The conflict was real; the resolution is that the derivation packs instead, and the
   holes it cannot avoid are shown in the budget readout rather than hidden by reflowing
   someone's arrangement.
5. **Keyboard operation is built but not audited — a recorded position, not a gap.** Reorder
   has an arrow-key path (3.6), the size picker is a labelled `menuitemradio` group that closes
   on Escape without leaving edit mode, and every affordance is a real `<button>` with a label.
   A dedicated keyboard-only or screen-reader walkthrough was **considered and declined**
   (2026-08-23): this is a single-user wall display, and the cost was not judged worth it. If
   the dashboard ever gains other users, this is the first thing to revisit.
6. ~~**Three migrations in short succession** (`0012` visibility, `0013` order, `0014`
   sizing).~~ **Closed in Phase 8** by migration `0016` — `dashboard_cards`, one row per
   exception, replacing all three columns with no user-visible change (D15). Done in a phase
   where no feature needed it, which is the only condition under which it was a good migration
   to write; Phase 7 declining to be forced into it was the right call at the time.
7. **No test coverage.** The repo has no test suite; verification is typecheck + build +
   live inspection (§8). The packer and budget check (4.3) are pure and are the pieces that
   would genuinely benefit from a unit test — they were checked instead with a throwaway Node
   harness that replays D2's whole table plus the packing-hole cases. Flag if a test runner is
   ever adopted; that harness is the test, and it is not in the repo. **The layout half now has
   `/layout-lab`** (§10) — not a test, but the contact sheet that makes fit failures visible.
8. **Every card now fits; only some *gain* from extra room.** News pages to fit, Gaming and
   Health clamp to fit, Calendar/Tasks/Insights already did, and Weather sheds days rather
   than sliding them off the edge. What a *narrower* card should show is answered. What a
   **bigger** card should show is not: a 2×2 Weather card still shows five days, just larger.
   That is a product question rather than a fit question, and is not scheduled.
10. **Dead CSS removed while here:** `.weather-forecast` (never rendered — the real strip is
   `.weather-outlook`) and `.log-older` (replaced by the always-rendered `ClippedNote`, which
   has the fixed height the measurement needs). `.span-2` was the same class of thing, retired
   in 4.4.
11. ~~**Presets are not user-definable.**~~ **Closed in Phase 7.** A `card_presets` table
   (migration `0015`), not the `dashboard_cards` consolidation — which turned out to be a
   different problem and stays deferred on its own merits (gap 6). See D13.
12. **A preset overwrites a hand-made arrangement, and Undo is session-only.** *Partly closed
   by Phase 7:* there is now a way to keep a wall before replacing it — but only if the user
   remembers to press `+ Save` first. Undo itself is unchanged: it survives only until the
   layout stops matching the preset that was applied, or edit mode closes, and nothing is
   persisted. Applying a preset over an unsaved arrangement, leaving, and coming back still
   loses it. Acceptable for a single-user wall display.
13. **Presets are hidden below 720px** (1 column), where sizes collapse anyway (D8). A preset
   whose point is its spans would be a lie there. What a preset should mean on a phone is
   unanswered, and is a product question rather than a layout one.
14. **No saved preset absorbs a card that ships later.** A user's preset stores the roster
   (D12/D13), and unlike `wall` it cannot name the live `CARD_KEYS` constant — so when the
   Homelab card lands, every saved preset hides it, silently and with no backfill. *Partly
   closed in Phase 8:* the behaviour is unchanged and deliberately so, but it is no longer
   silent — a saved chip shows `n/9` when its roster is short of the live constant, and the
   `Saved` label says the rule (8.4). What is still true is that there is no way to add the new
   card to an existing preset except by applying it, restoring the card, and re-capturing.

15. ~~**There is no rename in the UI.**~~ **Closed in Phase 8.** The chip carries the third
   fused button after all: the workaround the omission left behind was delete-then-save, which
   destroys a saved arrangement to change a label. No API change — `PATCH
   /dashboard/presets/:id` already took `name` — and the field is shared with `+ Save` so the
   two cannot disagree about which names are offerable (8.3).

16. **Undo covers applying a preset and nothing else.** Saving, deleting and re-capturing are
   all outside it. *Partly closed in Phase 8:* re-capture now arms before it fires, the same
   two-step delete has had since 7.2 and sharing one arming slot with it (8.3), so there is no
   longer an unguarded destructive write on a chip. Undo itself is unchanged and still covers
   only *applying* a preset — arming is a confirmation, not a way back.

17. **Saved presets are not refetched.** `staleTime: Infinity`, matching the layout query — a
   preset saved in another tab will not appear in this one until reload. Deliberate and
   consistent (the list only changes when this user changes it), and stated because "consistent
   with the layout query" is the whole argument for it.

18. **The demo session cannot see Phase 7 at all.** Edit mode is demo-gated (Phase 6), so a
   portfolio visitor never reaches the preset row, and nothing is seeded into `card_presets`.
   The seed's reset does clear the table, so the contract that a re-run wipes the demo user
   completely still holds.

19. **Name uniqueness is exact.** `normalisePresetName()` trims and collapses whitespace, but
   `Morning` and `morning` are two different presets. Not worth a case-folding rule for a
   single-user wall; noted so it is a decision rather than an oversight.

20. **Gap 5's standing position now covers new surface.** The keyboard walkthrough declined on
   2026-08-23 predates the inline save field and the armed delete, which are the first
   text-entry and two-step controls in edit mode. The position is unchanged — single-user wall
   display — but the surface it applies to grew.

9. ~~**News's `scrollable` opt-out (5.7) is now inert.**~~ **Closed in Phase 8, by keeping
   it.** The flag was never inert — it does two things, and News and Today want them in
   different proportions: Today really scrolls, while News needs only the half that keeps the
   shared drop pass off a card already measuring its own list. That was a documentation bug,
   not a code one; the two reasons are now written where the flag is read (8.5).

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
- **`/layout-lab` clean** for any change touching card fit: no `OVERFLOW`, no `SLACK` (§10).
- **Confirm a demo session cannot `PATCH`** the layout (expect the `demoReadOnly` 4xx).
- P4 additionally: confirm the cell budget cannot be exceeded **via the size picker**, and
  that a hand-crafted over-budget `sizes` `PATCH` is rejected server-side — while a *hide* or
  *reorder* that overflows is still accepted and merely warned about (D9).

P7 additionally (7.9 — **walked and green, 2026-08-24**):

- **Save round-trip.** Arrange a wall, `+ Save` it, reload — the chip is still there, it
  highlights as active, and applying it after a hand-edit restores the arrangement exactly.
- **The refusals**, each surfacing as a message rather than a silent failure: an empty name, a
  duplicate name (client-side, before the request), a ninth preset, an arrangement too tall for
  one screen, and — **7.10** — an arrangement identical to a preset that already exists, both
  when that preset is one of the user's own and when it is a built-in. `+ Save` is disabled with
  the offending preset named in its tooltip.
- **Exactly one chip is ever highlighted.** Apply each built-in and each saved preset in turn;
  no state may light two. Then try to save the current wall while a preset already matches it —
  that is the gesture that used to produce the double highlight.
- **Delete arms and disarms** — first click shows `Delete?`, blurring cancels, the second click
  removes the chip and leaves the dashboard untouched.
- **Re-capture** appears only on a preset that does *not* match the screen, and updates it. It
  must also disappear when the screen matches a *different* preset (7.10), and must still work
  when the screen matches nothing.
- **Undo across two presets** — apply a built-in, then a saved one; Undo must return to the
  built-in state, not two steps back.
- **`Escape` in the name field closes the field only**, leaving edit mode intact.
- **The bar at eight saved presets** — it must wrap inside its own `max-width`, the way the
  hidden tray does at seven, not run off the screen.
- **One column (≤720px):** the whole preset row is gone — both labels, both lists, `+ Save`.
- **`/layout-lab`** shows the saved-preset audit, all pass, with holes reported as a count and
  no `DUPLICATE OF` row.
- **Demo:** confirm `POST` / `PATCH` / `DELETE /dashboard/presets` all 4xx under `demoReadOnly`.

P8 additionally (8.10 — **walked and green, 2026-08-24**):

**The migration, with no `workerd` process running** (§9) — the half that had to happen first,
because nothing else in the phase could be checked until the columns had moved.

- ✅ **Before:** the three columns were dumped to `.backup-0016/` along with a copy of the
  local D1 file — that was the only copy, and the drops are irreversible.
- ✅ Applied, and confirmed with `SELECT name FROM d1_migrations` (**not** by looking at the
  table — the column existing is not the reliable check). `PRAGMA table_info(user_settings)`
  shows the three columns gone; 18 tables now.
- ✅ **The backfill landed.** The one real user with a stored order came through as nine rows
  at `2, 12, 22, 29, 40, 48, 57, 66, 77` — registry order, exactly as stored (offsets, not
  indices — see 8.2). The demo user came through as the single `weather → 2x2` row it should.
  No user with nothing stored got a row, which is the D4 rule holding.
- ✅ `seed:demo:local` re-run clean; the demo's layout row survives the reset as one row.
- ✅ **The dashboard is unchanged** across the migration: same cards, same order, same sizes,
  same derived shape. A user-visible difference here would have been a bug, not a feature —
  that is the whole claim of D15.
- ✅ **Round-trip:** hide, reorder, resize, reload; then restore the default and confirm the
  rows are *deleted* rather than left behind saying nothing.
- ✅ **Registry order writes no positions.** The real user was the frozen-default case — their
  stored order *is* registry order — so the reorder-and-undo left every `position` at `NULL`
  rather than a dense `0..8`. That is the small improvement D15 claims, and it is also what
  normalised the backfilled `instr()` offsets away.

**`1x3` (D14):**

- Every size in the picker, including the new one, at all three widths and in both themes.
- The glyph field: `1x3` and `1x2` must be **visibly different** in the menu — that is the
  bug the 3×2 field would have shipped.
- **`/layout-lab` at 54 tiles**, not 45. No `OVERFLOW`, no `SLACK`. The nine `1x3` tiles are
  entirely new surface and are the ones to read first; a card that has only ever been audited
  at two rows tall has no claim to fit at three.
- The budget check still refuses what it should: a `1x3` that would not pack is greyed out in
  the picker, and a hand-crafted `PATCH` of the same is refused server-side.
- At ≤720px a `1x3` collapses to one row like every other span (D8).

**The preset row:**

- **Rename** — the field opens on the chip, pre-filled and selected; `Enter` commits,
  `Escape` closes the field and **not** edit mode; confirming the name unchanged is a no-op
  rather than a 409; a name already taken is refused, and the preset's *own* name is not
  counted as taken.
- **Re-capture arms** — first click reads `Replace?`, blurring cancels, the second click
  writes. Reaching for delete while re-capture is armed disarms re-capture, and vice versa:
  **no chip may ever show two armed controls.**
- **The roster count** — a preset saved with fewer than nine cards shows `n/9`; one holding
  all nine shows nothing. The `Saved` label's tooltip states the rule.
- Everything Phase 7's list already covers still holds: one highlight, the five refusals, the
  bar wrapping at eight presets, the whole row gone at one column (**including the new
  rename button and the count**), and the demo lockout on all three write verbs.

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
- **D1 refuses a `json_each` correlated to an outer table — but only in a *write*.** Found
  building `0016`. `SELECT … FROM user_settings s, json_each(s.card_order) j` returns the right
  rows; wrapping the identical query in an `INSERT … SELECT` fails with `malformed JSON:
  SQLITE_ERROR`. So does `CREATE TABLE … AS SELECT`, which rules out the `INSERT` itself, and so
  do `CROSS JOIN` and a materialised CTE, which rules out join-order reordering as the fix.
  Scalar JSON functions are fine in writes. **The lesson generalises past migrations: a
  `json_each` query that reads correctly proves nothing about whether it will run as a write.**
  The workaround is to name the keys — a recursive CTE splitting a literal list, cross-joined
  with scalar `json_extract`/`instr` per key. A nine-term `UNION ALL` is not the workaround:
  that hits D1's compound-SELECT limit.
- **A failed migration rolls back completely.** `0016`'s first attempt died mid-file and left
  nothing behind — no `d1_migrations` row, no table, all three columns intact — so the retry
  started clean rather than half-migrated. Worth knowing, and worth re-confirming rather than
  assuming, because the recovery plan for a *partly* applied drop-columns migration is much
  worse than for a failed one.
- **`.settings-disabled` was deleted** along with the teaser it existed for. `.span-2` is
  still present and still dead — it is retired in 4.4, not here.

---

## 10. The layout lab (`/layout-lab`)

Dev-only route, unlinked from the app and redirected away in production builds. Renders **every
card at every size** — nine by six since `1x3` landed (D14) — in tiles the real grid would produce, with a column-count
control for the shapes that matter.

**Why it exists.** Every layout change up to this point was verified against whichever one or
two combinations happened to be on screen, and three consecutive fixes each introduced the next
bug: `overflow: hidden` turned a squeeze into a silent crop, `flex-shrink: 0` turned the crop
into over-dropping. That is not bad luck, it is the method — fixing layout from a screenshot of
one card in one state.

**The asymmetry it corrects.** There are two failure directions and only one is visible.
Overflow announces itself: cropped content looks broken. **Slack does not** — a card that gave
up its outlook and left 200px unused just looks like a card with little to say. Both bugs that
prompted this page were of the second kind, and both were found by eye, by luck.

So each tile reports what a screenshot cannot:

| Verdict | Meaning |
|---|---|
| `OVERFLOW npx` | Content is cropped — the fit pass ran out of droppable blocks, or none were marked. |
| `SLACK npx · gave up …` | Content was dropped **while space went unused**. The expensive, invisible one. |
| `scrolls` | The card opted in (News, Today — D10). Overflow here is the design. |
| `fits · dropped n, clipped n` | Adapted correctly: it gave something up and used the room it had. |
| `empty npx` | Nothing dropped, but a lot of dead space — usually a data limit rather than a layout fault. |

**How it measures.** It observes `class` attribute changes as well as size, because the
interesting events — `.is-dropped` and `.is-clipped` being toggled by the fit hooks — change no
box at all, so a `ResizeObserver` alone would never see them. Reports are compared before being
committed to state, since an observer watching classes that re-renders on every read is a loop
waiting to happen.

**Container queries measure the *content box*.** `.card` carries 1.5rem of horizontal padding,
so a threshold sits ~48px below the tile width it appears to name: a 404px tile queries as
356px. Weather's text swap was written at 400px and therefore fired on a tile with 50px of
width to spare and 200px of height unused. Thresholds here are arithmetic, not taste — five
chips plus four 8px gaps need about 300px of content box before a chip stops fitting its label,
icon, percentage and hi/lo.

**It counts what is *not rendered*, not what was dropped.** The first version counted only
`.is-dropped` and so scored that same Weather tile OK, because a container query had hidden the
strip rather than the fit pass. What matters is that content is gone, not which mechanism
removed it. Alternate renderings mark themselves `data-fallback` and are excluded, since one
half of a pair is always hidden by design.

**What it is not.** Not a test suite: nothing fails CI, nothing is automated, it still needs
eyes. It is a contact sheet. Its value is that one screenshot of it covers 54 combinations
instead of one, which is the actual bottleneck when the person changing the CSS cannot see the
browser.

---

## 11. History

| Date | Entry |
|---|---|
| 2026-08-21 | Card visibility scoped as Phase 1 of `integrations/homelab-telemetry.md` (D1 there), sizing explicitly deferred. |
| 2026-08-22 | This document created. Audit of prior art; sizing pulled into scope as Phase 2; substrate decided (D1 here); phases 3–5 added. No code written. |
| 2026-08-22 | **Phase 1 built and verified** (1.1–1.9). D2 corrected mid-build: rows are derived, not pinned at 3. Gap 1 closed. Implementation notes in §9. |
| 2026-08-22 | **Reordering built** as Phase 3, ahead of sizing — drag on native pointer events plus arrow keys; B1 closed with no dependency. Sizing -> Phase 4. |
| 2026-08-22 | **Edit mode built** as the new Phase 2, ahead of sizing — arrangement moved onto the dashboard; Settings section removed. Sizing → Phase 3, reorder → Phase 5. |
| 2026-08-22 | **Sizing built** as Phase 4 (4.1–4.8). D9 added: `dense` dropped, and the grid shape now *packs* spans rather than counting cells — counting says yes to layouts four rows tall. Picker moved from Settings to edit mode; `gridShape()` moved to `packages/types` so the meter and the server validator are one function. Gaps 3 and 4 closed. |
| 2026-08-22 | Browser pass. D2 corrected **again** (rows before columns — column-first made 3 cards a 6:1 letterbox). Cards were scrolling: Tasks and Insights rendered unbounded lists. Built `useClampList` (3.1) and applied it to Calendar, Tasks, Insights rather than tuning per-card constants. |
| 2026-08-23 | The `0012` miniflare trap recurred on `0014` — same cause, unrecognisable symptom (reorder failing while the dashboard rendered). §9 extended with the read/write asymmetry that makes it present as a broken feature. |
| 2026-08-23 | **Phase 4 verified** (4.9). Live pass green at all three widths in both themes, spans confirmed on the two former hand-rolled shells, picker limits and the D9 asymmetry exercised, demo session confirmed read-only. B2 closed. |
| 2026-08-23 | **5.10 verified**; **5.11 started** — News paging made size-aware. `PER_PAGE = 5` replaced by a measured page size via `useClampList`, and page *indices* replaced by an offset stack, because a measured page size makes an index point at different content after a resize. Gaming's fixed 6 matches is the remaining instance. |
| 2026-08-23 | **5.11 completed** — Gaming's `slice(0, 6)` replaced by the clamp + `+N more`, and its match list stopped scrolling (it had quietly exempted itself from the no-scroll rule). Applying it exposed a latent bug in `useClampList`: a `useRef` element meant the observers never re-bound when a conditionally-rendered list remounted, freezing `clippedCount` — now a callback ref backed by state. Phase 5 complete. |
| 2026-08-23 | Two defects caught from screenshots of a real 12-cell layout. `ClippedNote` appended a bare `s` and rendered "+4 more matchs" — it now takes an optional plural. And on a tile too short for one row the clamp hid *every* row, leaving News blank under a "1–1 of 34" readout; `useClampList` now never hides the first row, so a clipped row is visible rather than absent. Both fixes are primitive-level and cover all four clamped cards. |
| 2026-08-23 | **D10 recorded** after four-column tiles exposed two width failures. Weather's day strip was sliding off the edge (`flex: 1 0 auto` over `overflow-x: auto`) and Health's form wrapped and pushed its Log button out of reach. Scroll policy is now a named list — Today and News scroll, everything else fits in both axes — and Health's entry list clamps so the card yields its *list*, never its controls. |
| 2026-08-23 | Weather's outlook gained a text fallback (D10): below 400px of tile the day strip is replaced by a one-line summary rather than degrading into unreadable chips. `.gaming-matches` capped at `max-content` so a queue with fewer games than fit no longer stretches to full height and strands the disclaimer at the card's bottom edge. |
| 2026-08-23 | Weather's outlook was compressing instead of dropping: flex children shrink by default, so the block never overflowed and `useFitSections` saw nothing to do. `.card-body [data-drop-order]` is now `flex-shrink: 0`, and the outlook's text form carries the highest drop order so it *replaces* the strip rather than leaving with it. |
| 2026-08-23 | **Layout lab built** (`/layout-lab`, dev-only) after three consecutive fixes each caused the next bug. Renders all 45 card×size combinations and flags OVERFLOW and SLACK — the second being the failure mode nobody can see by eye, and the one behind both Weather regressions. |
| 2026-08-23 | First run of the lab, two findings within minutes. Weather's text swap fired ~50px early because container queries measure the **content box**, not the tile — threshold moved 400px → 300px. Health 1×1 flagged `OVERFLOW 12px`: its fixed parts overshot the tile with the entry list already thinned to nothing, so the today-total is now `data-drop-order="1"` — the card gives up a figure the form and list imply, never a control. `.log-list` capped at `max-content` like `.gaming-matches`. The lab itself was wrong too, scoring the Weather tile OK; it now counts blocks that are *not rendered* whatever hid them. |
| 2026-08-23 | All 45 card×size tiles confirmed clean in the lab. Phase 5 closed. Remaining across the whole document: 2.9 (keyboard hide/restore, deliberately unverified) and the Phase 0 contract mirror. |
| 2026-08-23 | **2.9 closed as not required**, not deferred — a keyboard-only walkthrough was considered and declined for a single-user wall display. Phase 2 is 9/9. The only thing outstanding in this document is the Phase 0 contract mirror. |
| 2026-08-24 | **Phase 6 verified** (6.8). Full §8 pass walked: each preset produces its stated shape with no holes, the active highlight clears on hand-edit, Undo restores and then correctly disappears, chip alignment holds after the glyph bump, the tray wraps at seven hidden cards, presets hide at one column, both themes clean, lab audit reads all-pass, and a demo session cannot long-press into edit mode. Nothing outstanding in this document. |
| 2026-08-23 | **Phase 6 built — presets** (6.1–6.7). Wall / Focus / Minimal as constants in `packages/types`, applied as one `PATCH` with no new endpoint and **no migration**; D12 recorded. Presets store the *roster* rather than the exceptions — the inverse of D4 — so a card shipped later joins Wall (which names `CARD_KEYS`) and stays out of Focus and Minimal. All three pack with zero holes, asserted in `/layout-lab` rather than trusted, since the repo has no test runner (gap 7). Two pre-existing defects surfaced: the long-press into edit mode was never demo-gated (only the header toggle was), and the edit bar could not wrap — which had never mattered until Minimal made hiding seven cards a single click. |
| 2026-08-23 | **Phase 0 closed — contract mirrored.** D1/D2/D5/D6/D9/D10 written into `integrations/homelab-telemetry.md` as its D11(a)–(e), under an explicit note that the two D-number sets collide and must never be cited bare across files. Four things there were **wrong**, not merely stale, and were corrected in place with the original struck rather than overwritten: the pinned-rows `ceil(N/3)` column rule, the prediction that order and sizing would force a `dashboard_cards` table, Phase 2's migration number (`0013` → `0015`, both consumed here), and span/reorder still listed as deliberately out of plan. Two new open items were raised **on the homelab side**: `HomelabCard` must arrive with a fit strategy under D11(e), and it takes `/layout-lab` from 45 tiles to 50. |
| 2026-08-24 | **Phase 7 built — user-defined presets** (7.1–7.8). D13 recorded: a `card_presets` **table** (migration `0015`), not a fourth JSON column and not the `dashboard_cards` consolidation, which is a different problem and stays deferred. `PresetArrangement` extracted so a saved preset is applied, matched, drawn and audited by exactly the code the built-ins use — `matchingPresetKey()` now sits on a shared `layoutMatchesArrangement()`. Applying a saved preset is still one `PATCH /dashboard/layout`; the new routes only manage rows. Save is non-optimistic and delete is, for opposite reasons (7.1); delete arms before firing (7.2); the saved audit drops the zero-holes assertion because a sparse wall is the user's call (7.3); `+ Save` carries the same `fitsGrid` gate the size picker does, since the live layout is allowed to overflow and a preset is not (7.4). Two pre-existing things fixed: the ≤720px rule left the `Presets` label standing over an empty row, and `Escape` in a text field would have exited edit mode. **7.9 verification not started** — the phase is built, not shipped. |
| 2026-08-24 | **7.10 — one wall, one name.** The first build of Phase 7 let a user save an arrangement identical to an existing preset and lit *every* matching chip, reasoning that there was no honest way to pick a winner between them. Correct reasoning, wrong conclusion: the fix is to make the duplicate unstorable, not to display the ambiguity more truthfully. `duplicateArrangement()` now refuses a save or re-capture that would produce a second preset for the same wall — **built-ins included**, since "My Wall" identical to Wall fails the same way — enforced in the API (D6), greyed out with the offending preset named in the edit bar, and asserted in `/layout-lab` for rows that predate the check. `matchingSavedPresetIds()` stays plural on purpose: nothing backfills, so an older duplicate must still highlight rather than vanish from the comparison. D13 amended. |
| 2026-08-24 | **Phase 7 verified** (7.9). Full §8 live pass walked, Phase 7 additions included: a saved preset survives a reload and re-applies exactly, all five refusals surface as messages rather than silent failures, no state lights two chips (the defect 7.10 was written for), delete arms and disarms without touching the layout, re-capture appears and disappears on the three states it should, Undo steps back one preset rather than two, `Escape` in the name field leaves edit mode intact, the bar wraps at eight saved presets, the whole preset row is gone at one column, the lab audit is all-pass with no `DUPLICATE OF`, and a demo session is refused on all three write verbs. **Nothing outstanding in this document.** The next work here is the Homelab card, which is now unblocked — see `../../integrations/homelab-telemetry.md` D11(f) for what it inherits. |
| 2026-08-24 | **Phase 8 scoped and built — consolidation and the unguarded edges** (8.1–8.9). There was no Phase 8 on record; three of the four candidates `HANDOVER.md` listed were taken and the Homelab card deliberately left out. **D14:** `1x3` joins the size union — the full-height column, earning its place on the same ground `3x1` did, and costing one thing the estimate missed: the picker's 3×2 glyph field cannot draw a 3-tall span and would have drawn it identically to the `1x2` beside it, so it is now 3×3. **D15:** the three layout JSON columns become rows in `dashboard_cards` (migration `0016`, which creates, backfills and drops in that order). D4 survives intact — `position` is a *sparse* sort key, so a card with no row is still visible, 1×1, in registry order and needs no backfill. Gap 6 closed, and closed here rather than in Phase 7 precisely because no feature needed it: with no user-visible difference to get wrong, the only thing that can fail is the migration. Gaps 15 and 16 closed on the preset chip — rename added (reversing Phase 7's "no third fused button", because the workaround it left was delete-then-save) and re-capture now arms like delete, sharing one arming slot so no chip can show two armed controls. Gap 14 made visible rather than fixed: a chip shows `n/9` when its roster is short of the live constant. Gap 9 closed by **keeping** `scrollable` — it was never inert, it does two things and the two exempt cards want them in different proportions; the bug was in the reason, not the code. **8.10 partially walked.** |
| 2026-08-24 | **`0016` applied locally, after the backfill had to be rewritten twice.** The `json_each` form was correct SQL and correct against the data — and **D1 refuses it in a write**: `SELECT … json_each(s.card_order)` returns the right rows, the same query inside an `INSERT … SELECT` fails with `malformed JSON`. `CROSS JOIN`, a materialised CTE and `CREATE TABLE … AS SELECT` all fail the same way, so it is neither the `INSERT` nor join ordering. The nine-key `UNION ALL` that replaced it hit D1's compound-SELECT term limit. What ships is a recursive CTE over a literal key list with scalar `json_extract`/`instr` per key — and `position` backfilled as a byte offset rather than an index, which is sound because D15 makes it a sort key and the first write normalises it. The failed first attempt rolled back completely, so the retry started clean. Backfill verified row-by-row against the real user (nine rows in stored order) and the demo (one `weather → 2x2`); `seed:demo:local` re-run clean; 18 tables. **The live and lab passes are still unwalked** — the 54 tiles, and every UI change in the phase. |
| 2026-08-24 | **Phase 8 verified** (8.10). Full §8 live pass walked, Phase 8 additions included: the dashboard is byte-for-byte the same wall across the migration (the whole claim of D15), the layout round-trip deletes rows rather than leaving them saying nothing, registry order writes no positions — which also normalised the backfilled `instr()` offsets away — all **54** lab tiles clean including the nine new `1x3` ones, `1x3` and `1x2` visibly distinct in the picker glyph, rename commits on `Enter` and leaves edit mode intact on `Escape`, no chip ever shows two armed controls, the roster count appears only on short rosters, and the demo session is still refused on every write verb. **Nothing outstanding in this document.** Gap 2 closes with it: every card is now audited at every size it can take. The next work here is the Homelab card — see `../../integrations/homelab-telemetry.md` D11(e)–(g). |
