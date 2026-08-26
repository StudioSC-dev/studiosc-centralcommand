import { Hono } from "hono";
import { sanitiseText } from "@central-command/utils";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail, ok } from "../lib/response";
import {
  createLabSource,
  deleteLabSource,
  listLabSources,
  readLab,
  rotateLabToken,
} from "../services/lab";

/**
 * The guarded half of the lab feature: what the card reads, and how a source is
 * minted, rotated and revoked. The push endpoints live in `lab-ingest.ts`,
 * outside the session guard.
 *
 * Every route here is user-scoped by the session, which is what makes D4 a real
 * boundary: a demo visitor resolves the demo user's seeded fictional lab and can
 * reach no other, regardless of what the client asks for. Card visibility is a
 * preference and must never be treated as a privacy control.
 *
 * The three write routes need no demo handling of their own — `demoReadOnly`
 * blocks every non-GET for a demo session before they are reached.
 */
export const lab = new Hono<AppEnv>()
  .get("/", async (c) => {
    return ok(c, await readLab(createDb(c.env.DB), c.get("userId")));
  })

  .get("/sources", async (c) => {
    const rows = await listLabSources(createDb(c.env.DB), c.get("userId"));
    // Never the hash. It is not a secret worth protecting on its own, but there
    // is no reason for it to leave the database either.
    return ok(c, {
      sources: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.createdAt,
        rotatedAt: row.rotatedAt,
        lastSeenAt: row.lastSeenAt,
        agentVersion: row.agentVersion,
      })),
    });
  })

  .post("/sources", async (c) => {
    const body = await c.req.json<{ label?: unknown }>().catch(() => ({}) as { label?: unknown });
    const label = sanitiseText(body.label, 60) || "Homelab";
    const created = await createLabSource(createDb(c.env.DB), c.get("userId"), label);
    // 201 with the plaintext token — the ONLY time it is ever returned.
    return ok(c, created, 201);
  })

  .post("/sources/:id/rotate", async (c) => {
    const rotated = await rotateLabToken(
      createDb(c.env.DB),
      c.get("userId"),
      c.req.param("id"),
    );
    if (!rotated) return fail(c, "not_found", "No such lab source.", 404);
    return ok(c, rotated);
  })

  .delete("/sources/:id", async (c) => {
    const removed = await deleteLabSource(createDb(c.env.DB), c.get("userId"), c.req.param("id"));
    if (!removed) return fail(c, "not_found", "No such lab source.", 404);
    return ok(c, { deleted: true });
  });
