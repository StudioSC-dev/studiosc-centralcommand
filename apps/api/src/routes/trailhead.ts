import { Hono } from "hono";
import { sanitiseText } from "@central-command/utils";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail, ok } from "../lib/response";
import {
  createIngestSource,
  deleteIngestSource,
  listIngestSources,
  rotateIngestToken,
} from "../services/ingest-sources";

/**
 * The guarded half of the trailhead feature: mint, rotate, revoke, and list
 * credentials for the `ingest_sources` row with `source='trailhead'`. The push
 * endpoint lives in `trailhead-ingest.ts`, outside the session guard.
 *
 * Mirrors `routes/lab.ts`. Every route here is user-scoped by the session, and
 * `demoReadOnly` (mounted on the parent `/api` group) already blocks every
 * non-GET for a demo session before these are reached, so no route here needs
 * its own demo handling.
 *
 * No `:id` path parameter: `UNIQUE(user_id, source)` makes the source name the
 * addressable key, same shape as the (single) row this table holds today.
 */
export const trailhead = new Hono<AppEnv>()
  .get("/sources", async (c) => {
    const rows = await listIngestSources(createDb(c.env.DB), c.get("userId"));
    // Never the hash. It is not a secret worth protecting on its own, but there
    // is no reason for it to leave the database either.
    return ok(c, {
      sources: rows.map((row) => ({
        source: row.source,
        label: row.label,
        createdAt: row.createdAt,
        rotatedAt: row.rotatedAt,
        lastSeenAt: row.lastSeenAt,
      })),
    });
  })

  .post("/sources", async (c) => {
    const body = await c.req.json<{ label?: unknown }>().catch(() => ({}) as { label?: unknown });
    const label = sanitiseText(body.label, 60) || "Trailhead";
    const created = await createIngestSource(createDb(c.env.DB), c.get("userId"), "trailhead", label);
    if (!created) return fail(c, "already_exists", "A trailhead source is already connected.", 409);
    // 201 with the plaintext token — the ONLY time it is ever returned.
    return ok(c, created, 201);
  })

  .post("/sources/rotate", async (c) => {
    const rotated = await rotateIngestToken(createDb(c.env.DB), c.get("userId"), "trailhead");
    if (!rotated) return fail(c, "not_found", "No such trailhead source.", 404);
    return ok(c, rotated);
  })

  .delete("/sources", async (c) => {
    const removed = await deleteIngestSource(createDb(c.env.DB), c.get("userId"), "trailhead");
    if (!removed) return fail(c, "not_found", "No such trailhead source.", 404);
    return ok(c, { deleted: true });
  });
