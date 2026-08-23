import { Hono } from "hono";
import {
  fitsGrid,
  isCardKey,
  isCardSize,
  type CardKey,
  type CardSizes,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
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
  });
