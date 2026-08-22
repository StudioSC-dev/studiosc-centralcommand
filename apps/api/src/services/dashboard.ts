import { CARD_KEYS, isCardKey, type CardKey, type DashboardLayout } from "@central-command/types";

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

/** Expand a hidden set into the full layout, deriving `visible` server-side. */
export function toLayout(hidden: readonly CardKey[]): DashboardLayout {
  const hiddenSet = new Set(hidden);
  return {
    hidden: CARD_KEYS.filter((key) => hiddenSet.has(key)),
    visible: CARD_KEYS.filter((key) => !hiddenSet.has(key)),
  };
}

/** Serialise for storage. `null` when nothing is hidden, so the common case
 * leaves the column empty rather than holding an empty array. */
export function serialiseHiddenCards(hidden: readonly CardKey[]): string | null {
  return hidden.length === 0 ? null : JSON.stringify(hidden);
}
