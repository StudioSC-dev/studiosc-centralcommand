import {
  isCardKey,
  isCardSize,
  normaliseCardSizes,
  type CardKey,
  type CardSizes,
  type SavedPreset,
} from "@central-command/types";
import type { cardPresets } from "@central-command/db";

type PresetRow = typeof cardPresets.$inferSelect;

/**
 * Read a stored roster into a clean key list.
 *
 * Lenient in the same way the layout read path is (`parseHiddenCards` and
 * friends): malformed JSON or a key we no longer ship degrades rather than
 * throwing. The failure mode is different here, though, and worth naming — a
 * preset stores the *roster*, so dropping an unrecognised key removes a card
 * from that preset instead of revealing one. That is still the safe direction:
 * a preset naming a card that no longer exists would otherwise be unapplyable.
 */
export function parsePresetVisible(raw: string): CardKey[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<CardKey>();
  const visible: CardKey[] = [];
  for (const key of parsed) {
    if (isCardKey(key) && !seen.has(key)) {
      seen.add(key);
      visible.push(key);
    }
  }
  return visible;
}

/** Read a stored size map. Lenient; an unreadable blob means "all 1x1". */
export function parsePresetSizes(raw: string | null): CardSizes {
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
 * Keep only the sizes of cards that are actually in the roster.
 *
 * A size stranded on a card the preset does not include is invisible but not
 * inert: it would make two presets that render identically compare as
 * different, so the active-state highlight would refuse to light for one of
 * them. Applied on write and on read, so rows written before this existed are
 * cleaned on the way out too.
 */
export function scopeSizesToRoster(visible: readonly CardKey[], sizes: CardSizes): CardSizes {
  const roster = new Set(visible);
  const scoped: CardSizes = {};
  for (const [key, size] of Object.entries(normaliseCardSizes(sizes)) as [CardKey, CardSizes[CardKey]][]) {
    if (roster.has(key) && size) scoped[key] = size;
  }
  return scoped;
}

/** A stored row as the wire shape. */
export function toSavedPreset(row: PresetRow): SavedPreset {
  const visible = parsePresetVisible(row.visible);
  return {
    id: row.id,
    name: row.name,
    visible,
    sizes: scopeSizesToRoster(visible, parsePresetSizes(row.sizes)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Serialise a sparse size map for storage. `null` when empty, matching the
 * layout columns — the common case leaves the column empty, not `{}`. */
export function serialisePresetSizes(sizes: CardSizes): string | null {
  return Object.keys(sizes).length === 0 ? null : JSON.stringify(sizes);
}
