import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { cardPresets } from "@central-command/db";
import {
  PRESET_NAME_MAX,
  SAVED_PRESET_LIMIT,
  duplicateArrangement,
  fitsGrid,
  isCardKey,
  isCardSize,
  normalisePresetName,
  type CardKey,
  type CardSizes,
  type SavedPreset,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { newId } from "../lib/ids";
import { ok, fail } from "../lib/response";
import { getUserSettings, upsertUserSettings } from "../services/users";
import {
  parseCardOrder,
  parseCardSizes,
  parseHiddenCards,
  serialiseKeys,
  serialiseSizes,
  toLayout,
} from "../services/dashboard";
import { scopeSizesToRoster, serialisePresetSizes, toSavedPreset } from "../services/presets";

interface LayoutBody {
  hidden?: unknown;
  order?: unknown;
  sizes?: unknown;
}

/** Validate one key array from the request. Strict: an unknown key is a client
 * bug and is rejected, where the read path tolerates stale keys in storage. */
function readKeys(value: unknown, field: string): { keys: CardKey[] } | { error: string } {
  if (!Array.isArray(value)) return { error: `${field} must be an array of card keys.` };
  const unknown = value.filter((key) => !isCardKey(key));
  if (unknown.length > 0) return { error: `Unknown card key(s) in ${field}: ${unknown.join(", ")}` };
  return { keys: value as CardKey[] };
}

/** Validate the sparse size map from the request. Strict, for the same reason
 * `readKeys` is: an unknown key or an off-menu span is a client bug, where the
 * read path tolerates whatever history left in the column. */
function readSizes(value: unknown): { sizes: CardSizes } | { error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "sizes must be an object mapping card keys to sizes." };
  }

  const sizes: CardSizes = {};
  for (const [key, size] of Object.entries(value as Record<string, unknown>)) {
    if (!isCardKey(key)) return { error: `Unknown card key in sizes: ${key}` };
    if (!isCardSize(size)) return { error: `Unknown size for ${key}: ${String(size)}` };
    sizes[key] = size;
  }
  return { sizes };
}

/**
 * Validate the arrangement half of a saved-preset write.
 *
 * Strict, like every other layout write, plus two rules a *preset* needs that a
 * live layout does not:
 *
 * - **The roster cannot be empty.** A layout with everything hidden is a state
 *   a user can reach and back out of; a preset that produces it is a button
 *   that blanks the dashboard, and there is nothing on screen left to press.
 * - **It must fit the grid.** The same `fitsGrid` the size picker greys options
 *   out with (D5/D9). A preset is a promise that one click produces a usable
 *   wall — storing one that the layout endpoint would then refuse would put the
 *   rejection at apply time, which is the worst place for it.
 *
 * Sizes are scoped to the roster rather than rejected: a size on a card the
 * preset does not include is meaningless, not malformed.
 */
function readArrangement(
  body: { visible?: unknown; sizes?: unknown },
): { visible: CardKey[]; sizes: CardSizes } | { error: string } {
  const keys = readKeys(body.visible, "visible");
  if ("error" in keys) return keys;

  const visible = [...new Set(keys.keys)];
  if (visible.length === 0) {
    return { error: "A preset must show at least one card." };
  }

  let sizes: CardSizes = {};
  if (body.sizes !== undefined) {
    const parsed = readSizes(body.sizes);
    if ("error" in parsed) return parsed;
    sizes = parsed.sizes;
  }
  sizes = scopeSizesToRoster(visible, sizes);

  if (!fitsGrid(visible, sizes)) {
    return { error: "That arrangement doesn't fit the dashboard grid." };
  }

  return { visible, sizes };
}

/**
 * Refuse an arrangement that already exists under another name.
 *
 * Two presets describing the same wall are not merely redundant: the chip
 * highlight asks "which preset is this?", and with a duplicate stored there are
 * two true answers, so two chips light at once and the control stops reporting
 * a single state. Uniqueness is therefore enforced where it can actually hold —
 * on the write — rather than papered over in the display.
 *
 * The built-ins are checked too, because "My Wall" identical to Wall fails in
 * exactly the same way, and neither chip has a better claim.
 *
 * Enforced server-side as well as in the edit bar for the same reason every
 * other layout rule is (D6): the client greys the control out for feel, and the
 * API is what makes it true.
 */
function duplicateRefusal(
  arrangement: { visible: CardKey[]; sizes: CardSizes },
  saved: readonly SavedPreset[],
  excludeId?: string,
): string | null {
  const clash = duplicateArrangement(arrangement, saved, { excludeId });
  if (!clash) return null;
  return clash.kind === "builtin"
    ? `That is exactly the built-in “${clash.name}” preset — use that instead.`
    : `You already have a preset with this exact arrangement: “${clash.name}”.`;
}

export const dashboard = new Hono<AppEnv>()
  // The user's card layout. A user with no settings row gets the default
  // (everything visible) rather than a 404 — the layout is derived state, not a
  // resource the user has to create.
  .get("/layout", async (c) => {
    const current = await getUserSettings(createDb(c.env.DB), c.get("userId"));
    return ok(c, {
      layout: toLayout(
        parseHiddenCards(current?.hiddenCards),
        parseCardOrder(current?.cardOrder),
        parseCardSizes(current?.cardSizes),
      ),
    });
  })
  // Replace the hidden set. Not a delta: the client sends the full set it wants,
  // which makes the request idempotent and avoids add/remove races between two
  // open tabs.
  //
  // Strict on write (unknown keys are rejected) where the read path is lenient:
  // a bad key here is a client bug worth surfacing, whereas a stale key already
  // in the database is history and must not break the dashboard.
  //
  // Demo sessions never reach this — `demoReadOnly` blocks every non-GET.
  .patch("/layout", async (c) => {
    const body = await c.req.json<LayoutBody>().catch(() => null);
    if (
      !body ||
      (body.hidden === undefined && body.order === undefined && body.sizes === undefined)
    ) {
      return fail(c, "bad_request", "Provide hidden, order and/or sizes.", 400);
    }

    const db = createDb(c.env.DB);
    const current = await getUserSettings(db, c.get("userId"));

    // Each half is replaced independently, so reordering doesn't have to resend
    // the hidden set (and vice versa) — the two are edited by different gestures.
    let hidden = parseHiddenCards(current?.hiddenCards);
    let order = parseCardOrder(current?.cardOrder);
    let sizes = parseCardSizes(current?.cardSizes);

    if (body.hidden !== undefined) {
      const parsed = readKeys(body.hidden, "hidden");
      if ("error" in parsed) return fail(c, "bad_request", parsed.error, 400);
      hidden = parsed.keys;
    }

    if (body.order !== undefined) {
      const parsed = readKeys(body.order, "order");
      if ("error" in parsed) return fail(c, "bad_request", parsed.error, 400);
      order = parsed.keys;
    }

    if (body.sizes !== undefined) {
      const parsed = readSizes(body.sizes);
      if ("error" in parsed) return fail(c, "bad_request", parsed.error, 400);
      sizes = parsed.sizes;
    }

    // Normalise through the same derivation the read path uses, so what we store
    // is exactly what a subsequent GET would produce.
    const layout = toLayout(hidden, order, sizes);

    // The cell budget (docs/ui-suite.md D5/D9), enforced on the one write that
    // can be refused without creating a dead end. A *resize* has alternatives
    // sitting right next to it in the picker, so refusing costs the user
    // nothing; hiding and reordering are deliberately not checked, because
    // "you cannot restore this card until you shrink another one" is a trap.
    // `fitsGrid` is the same function the picker greys options out with, so a
    // disabled option and a rejected write cannot disagree.
    if (body.sizes !== undefined && !fitsGrid(layout.visible, layout.sizes)) {
      return fail(
        c,
        "bad_request",
        "That size doesn't fit the dashboard grid. Hide or shrink another card first.",
        400,
      );
    }

    await upsertUserSettings(db, c.get("userId"), {
      hiddenCards: serialiseKeys(layout.hidden),
      cardOrder: serialiseKeys(layout.order),
      cardSizes: serialiseSizes(layout.sizes),
    });

    return ok(c, { layout });
  })

  // ─── Saved presets (docs/ui-suite.md Phase 7) ─────────────────────────────
  //
  // A user's own named arrangements. The three built-in presets are constants
  // in `packages/types` and never appear here — this endpoint owns only what a
  // user saved, which is why Phase 6 needed no storage and this one does.
  //
  // Applying a preset is deliberately NOT a route: it is still one
  // `PATCH /layout` carrying the resolved fields, exactly as a built-in is
  // (D6/D12), so saved presets inherit the optimistic path, the shared error
  // surface and the server-side budget check without a second write path.
  //
  // Demo sessions can read these (they have none) but never write — every
  // non-GET below is blocked upstream by `demoReadOnly`.
  .get("/presets", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(cardPresets)
      .where(eq(cardPresets.userId, c.get("userId")));

    // Newest last, so a preset a user just saved lands at the end of the row
    // rather than shuffling the chips they already know the positions of.
    // Ids are UUID v7, so id order *is* creation order.
    return ok(c, { presets: rows.map(toSavedPreset).sort((a, b) => a.id.localeCompare(b.id)) });
  })

  .post("/presets", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Expected a JSON body.", 400);

    const parsed = readArrangement(body);
    if ("error" in parsed) return fail(c, "bad_request", parsed.error, 400);

    const name = normalisePresetName(body.name);
    if (!name) {
      return fail(c, "bad_request", `A preset needs a name of 1–${PRESET_NAME_MAX} characters.`, 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const existing = await db.select().from(cardPresets).where(eq(cardPresets.userId, userId));

    // Checked here as well as by the unique index, because the index can only
    // produce a constraint failure and this can say which name is taken.
    if (existing.some((row) => row.name === name)) {
      return fail(c, "conflict", `You already have a preset called “${name}”.`, 409);
    }
    if (existing.length >= SAVED_PRESET_LIMIT) {
      return fail(
        c,
        "conflict",
        `You can save up to ${SAVED_PRESET_LIMIT} presets. Delete one first.`,
        409,
      );
    }

    const duplicate = duplicateRefusal(parsed, existing.map(toSavedPreset));
    if (duplicate) return fail(c, "conflict", duplicate, 409);

    const now = Date.now();
    const row = {
      id: newId(),
      userId,
      name,
      visible: JSON.stringify(parsed.visible),
      sizes: serialisePresetSizes(parsed.sizes),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(cardPresets).values(row);

    return ok(c, { preset: toSavedPreset(row) }, 201);
  })

  // Rename, re-capture, or both. The two are independent gestures — "call this
  // Morning" and "make Morning what I am looking at now" — and sending only the
  // field you changed keeps each one a single small write.
  .patch("/presets/:id", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body || (body.name === undefined && body.visible === undefined)) {
      return fail(c, "bad_request", "Provide name and/or visible.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const id = c.req.param("id");

    // Scoped by user, so a guessed id reads as "not found" rather than
    // confirming that someone else's preset exists.
    const [current] = await db
      .select()
      .from(cardPresets)
      .where(and(eq(cardPresets.id, id), eq(cardPresets.userId, userId)));
    if (!current) return fail(c, "not_found", "No such preset.", 404);

    const update: Partial<typeof cardPresets.$inferInsert> = { updatedAt: Date.now() };

    if (body.name !== undefined) {
      const name = normalisePresetName(body.name);
      if (!name) {
        return fail(
          c,
          "bad_request",
          `A preset needs a name of 1–${PRESET_NAME_MAX} characters.`,
          400,
        );
      }
      if (name !== current.name) {
        const clash = await db
          .select()
          .from(cardPresets)
          .where(and(eq(cardPresets.userId, userId), eq(cardPresets.name, name)));
        if (clash.length > 0) {
          return fail(c, "conflict", `You already have a preset called “${name}”.`, 409);
        }
      }
      update.name = name;
    }

    if (body.visible !== undefined) {
      const parsed = readArrangement(body);
      if ("error" in parsed) return fail(c, "bad_request", parsed.error, 400);

      // Excluding this preset: re-capturing one onto an arrangement it already
      // describes is a no-op, not a duplicate, and refusing it would make the
      // button fail on the very case it is safest for.
      const siblings = await db.select().from(cardPresets).where(eq(cardPresets.userId, userId));
      const duplicate = duplicateRefusal(parsed, siblings.map(toSavedPreset), id);
      if (duplicate) return fail(c, "conflict", duplicate, 409);

      update.visible = JSON.stringify(parsed.visible);
      update.sizes = serialisePresetSizes(parsed.sizes);
    }

    await db
      .update(cardPresets)
      .set(update)
      .where(and(eq(cardPresets.id, id), eq(cardPresets.userId, userId)));

    return ok(c, { preset: toSavedPreset({ ...current, ...update }) });
  })

  .delete("/presets/:id", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const id = c.req.param("id");

    const [current] = await db
      .select()
      .from(cardPresets)
      .where(and(eq(cardPresets.id, id), eq(cardPresets.userId, userId)));
    if (!current) return fail(c, "not_found", "No such preset.", 404);

    await db
      .delete(cardPresets)
      .where(and(eq(cardPresets.id, id), eq(cardPresets.userId, userId)));

    // Deleting a preset does not touch the layout: the arrangement stays on
    // screen, it just stops having a name. Anything else would make delete a
    // destructive gesture on the thing the user is looking at.
    return ok(c, { deleted: id });
  });
