import { Hono } from "hono";
import { isCardKey, type CardKey } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getUserSettings, upsertUserSettings } from "../services/users";
import { parseHiddenCards, serialiseHiddenCards, toLayout } from "../services/dashboard";

interface LayoutBody {
  hidden?: unknown;
}

export const dashboard = new Hono<AppEnv>()
  // The user's card layout. A user with no settings row gets the default
  // (everything visible) rather than a 404 — the layout is derived state, not a
  // resource the user has to create.
  .get("/layout", async (c) => {
    const current = await getUserSettings(createDb(c.env.DB), c.get("userId"));
    return ok(c, { layout: toLayout(parseHiddenCards(current?.hiddenCards)) });
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
    if (!body || !Array.isArray(body.hidden)) {
      return fail(c, "bad_request", "hidden must be an array of card keys.", 400);
    }

    const unknown = body.hidden.filter((key) => !isCardKey(key));
    if (unknown.length > 0) {
      return fail(c, "bad_request", `Unknown card key(s): ${unknown.join(", ")}`, 400);
    }

    // Dedupe and normalise to registry order before storing.
    const hidden = toLayout(body.hidden as CardKey[]).hidden;

    const db = createDb(c.env.DB);
    await upsertUserSettings(db, c.get("userId"), {
      hiddenCards: serialiseHiddenCards(hidden),
    });

    return ok(c, { layout: toLayout(hidden) });
  });
