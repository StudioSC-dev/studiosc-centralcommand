import { eq } from "drizzle-orm";
import { dashboardCards } from "@central-command/db";
import {
  CARD_KEYS,
  DEFAULT_CARD_SIZE,
  DEFAULT_HIDDEN_KEYS,
  isCardKey,
  isCardSize,
  normaliseCardSizes,
  resolveCardOrder,
  type CardKey,
  type CardSizes,
  type DashboardLayout,
} from "@central-command/types";
import type { Database } from "../lib/db";

/**
 * The dashboard layout, as rows (docs/ui-suite.md D15).
 *
 * This replaces three JSON columns on `user_settings` — `hidden_cards` (0012),
 * `card_order` (0013) and `card_sizes` (0014) — with one row per *exception* in
 * `dashboard_cards`. The storage rule is unchanged and deliberately so (D4): a
 * card with no row is visible, at `1x1`, in registry order, so a card that
 * ships later still needs no backfill.
 *
 * What the parse/serialise pair below replaces was three near-identical lenient
 * JSON readers and two serialisers, each of which had to re-derive "is this
 * value still a card we ship?" against the same constant. A row is typed by the
 * column, so leniency collapses to two guards applied once.
 *
 * **Lenient in, strict out** is preserved exactly. A row naming a card we no
 * longer ship, or a size no longer on the menu, is dropped on read rather than
 * throwing — it is history, and history must not be able to break a dashboard.
 * The PATCH route stays strict, because a bad key arriving from a client is a
 * bug worth surfacing.
 */
export type DashboardCardRow = typeof dashboardCards.$inferSelect;

/**
 * Expand the stored rows into the full layout.
 *
 * `position` is a sparse sort key, not a dense index: rows that carry one sort
 * by it, and every other card falls in afterwards in registry order. That is
 * the same rule `resolveCardOrder()` applied to a partial JSON array, which is
 * what makes this a storage change and not a behaviour change.
 *
 * Pure, and separate from the query, because it is the half worth reasoning
 * about — and the half a test would exercise if this repo had a runner (gap 7).
 */
export function rowsToLayout(rows: readonly DashboardCardRow[]): DashboardLayout {
  const hidden = new Set<CardKey>();
  const sizes: CardSizes = {};
  const positioned: { key: CardKey; position: number }[] = [];

  for (const row of rows) {
    if (!isCardKey(row.card)) continue;
    if (row.hidden) hidden.add(row.card);
    if (isCardSize(row.size)) sizes[row.card] = row.size;
    if (row.position !== null) positioned.push({ key: row.card, position: row.position });
  }

  // Ties are impossible from our own writes (positions come from an array
  // index) but not from the database, which does not enforce uniqueness on a
  // sort key. Registry order breaks them, so a hand-edited row cannot make the
  // order depend on which order D1 happened to return the rows in.
  positioned.sort(
    (a, b) => a.position - b.position || CARD_KEYS.indexOf(a.key) - CARD_KEYS.indexOf(b.key),
  );

  return toLayout(
    CARD_KEYS.filter((key) => hidden.has(key)),
    positioned.map((entry) => entry.key),
    sizes,
  );
}

/**
 * Expand the stored state into the full layout.
 *
 * `order` is resolved to a total order (unknown keys appended in registry
 * order); `visible` is that order minus the hidden set. Both derived here so the
 * client never has to reproduce the rule.
 */
export function toLayout(
  hidden: readonly CardKey[],
  storedOrder: readonly CardKey[] = [],
  sizes: CardSizes = {},
): DashboardLayout {
  const hiddenSet = new Set(hidden);
  const order = resolveCardOrder(storedOrder);
  return {
    hidden: order.filter((key) => hiddenSet.has(key)),
    order,
    visible: order.filter((key) => !hiddenSet.has(key)),
    // Normalised on the way out as well as in, so a GET returns exactly what a
    // PATCH stored and the client's optimistic guess cannot drift from it.
    sizes: normaliseCardSizes(sizes),
  };
}

/**
 * The rows a layout should be stored as — only the exceptions.
 *
 * Positions are written **only when the order differs from registry order**.
 * The JSON column this replaces stored the full nine-key array after any PATCH,
 * even one that changed nothing about the order, which meant every user who had
 * ever touched their layout carried a frozen copy of a default. A card with no
 * position row sorts in registry order, so omitting them says the same thing
 * with nothing to keep in sync.
 *
 * When positions *are* written they are written for every key, including hidden
 * ones — a hidden card's place is what it reappears in, and dropping it would
 * make restoring a card move it.
 */
export function layoutRows(
  userId: string,
  layout: DashboardLayout,
  now: number,
): (typeof dashboardCards.$inferInsert)[] {
  const hidden = new Set(layout.hidden);
  const custom = layout.order.some((key, i) => CARD_KEYS[i] !== key);

  const rows: (typeof dashboardCards.$inferInsert)[] = [];
  layout.order.forEach((card, index) => {
    const isHidden = hidden.has(card);
    const size = layout.sizes[card];
    const position = custom ? index : null;
    // A row that says nothing is not written: "no row" already means visible,
    // 1x1, registry order (D4).
    if (!isHidden && position === null && (size === undefined || size === DEFAULT_CARD_SIZE)) {
      return;
    }
    rows.push({
      userId,
      card,
      hidden: isHidden ? 1 : 0,
      position,
      size: size ?? null,
      updatedAt: now,
    });
  });
  return rows;
}

/** The user's layout. A user who has never touched it has no rows; in that
 * case we seed hidden rows for DEFAULT_HIDDEN_KEYS so the starter set is
 * the original 9 cards, then return the seeded layout. */
export async function readLayout(db: Database, userId: string): Promise<DashboardLayout> {
  const rows = await db.select().from(dashboardCards).where(eq(dashboardCards.userId, userId));
  if (rows.length === 0 && DEFAULT_HIDDEN_KEYS.length > 0) {
    const seeded = toLayout(DEFAULT_HIDDEN_KEYS);
    await writeLayout(db, userId, seeded);
    return seeded;
  }
  return rowsToLayout(rows);
}

/**
 * Replace the user's layout rows wholesale.
 *
 * A full replace rather than a per-card diff, because a layout PATCH already
 * carries the complete set it wants (that is what makes it idempotent and free
 * of add/remove races between two tabs). Batched so the delete and the insert
 * land as one D1 transaction — half-applying this would reset a layout to the
 * default, which is exactly the failure the old single-column write could not
 * have.
 */
export async function writeLayout(
  db: Database,
  userId: string,
  layout: DashboardLayout,
): Promise<void> {
  const rows = layoutRows(userId, layout, Date.now());
  const clear = db.delete(dashboardCards).where(eq(dashboardCards.userId, userId));
  if (rows.length === 0) {
    await clear;
    return;
  }
  await db.batch([clear, db.insert(dashboardCards).values(rows)]);
}
