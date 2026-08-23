import {
  CARD_KEYS,
  isCardKey,
  isCardSize,
  normaliseCardSizes,
  resolveCardOrder,
  type CardKey,
  type CardSizes,
  type DashboardLayout,
} from "@central-command/types";

/**
 * Read the stored `hidden_cards` JSON into a clean key list.
 *
 * Deliberately lenient: malformed JSON, a non-array, or a key we no longer ship
 * all degrade to "nothing hidden" rather than throwing. A stale key left behind
 * by a removed card must never be able to break someone's dashboard — and since
 * we store the *exceptions* (docs/ui-suite.md D4), dropping an unrecognised one
 * fails safe by showing a card rather than hiding one.
 *
 * Writes are strict instead — see the PATCH route. Lenient in, strict out.
 */
export function parseHiddenCards(raw: string | null | undefined): CardKey[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const hidden = new Set(parsed.filter(isCardKey));
  // Normalise to registry order so the stored order can never leak out.
  return CARD_KEYS.filter((key) => hidden.has(key));
}

/**
 * Read the stored `card_order` JSON. Lenient for the same reasons as
 * `parseHiddenCards` — a stale key here fails safe by being ignored, leaving
 * that card in its registry position.
 */
export function parseCardOrder(raw: string | null | undefined): CardKey[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<CardKey>();
  const order: CardKey[] = [];
  for (const key of parsed) {
    if (isCardKey(key) && !seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

/**
 * Read the stored `card_sizes` JSON. Lenient in the same way as the two key
 * lists above: an unparseable blob, a stale key, or a size we no longer offer
 * all degrade to "that card is 1x1" rather than throwing. Because the map holds
 * only the exceptions (docs/ui-suite.md D4), dropping an entry fails safe — the
 * card comes back at its default size instead of at some impossible span.
 */
export function parseCardSizes(raw: string | null | undefined): CardSizes {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const sizes: CardSizes = {};
  for (const [key, size] of Object.entries(parsed as Record<string, unknown>)) {
    if (isCardKey(key) && isCardSize(size)) sizes[key] = size;
  }
  return normaliseCardSizes(sizes);
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

/** Serialise for storage. `null` when empty, so the common case leaves the
 * column empty rather than holding an empty array. */
export function serialiseKeys(keys: readonly CardKey[]): string | null {
  return keys.length === 0 ? null : JSON.stringify(keys);
}

/** As `serialiseKeys`, for the sparse size map. Normalised first, so a map of
 * nothing but `1x1` entries stores as `null` rather than `{}`. */
export function serialiseSizes(sizes: CardSizes): string | null {
  const clean = normaliseCardSizes(sizes);
  return Object.keys(clean).length === 0 ? null : JSON.stringify(clean);
}
