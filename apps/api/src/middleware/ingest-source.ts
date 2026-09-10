import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail } from "../lib/response";
import { ingestSourceForToken, type IngestSourceName } from "../services/ingest-sources";

/**
 * Bearer auth for a push-ingest route backed by `ingest_sources`.
 *
 * Mirrors `labSourceAuth` in `middleware/lab-source.ts`: no session, no
 * cookie — the caller authenticates with a per-source bearer token. **The 401
 * is uniform** across an unknown token and a token minted for a different
 * source, so the endpoint cannot be used as an oracle for which sources
 * exist. Detail goes to the log, never to the caller.
 */
export function ingestSourceAuth(source: IngestSourceName) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) return fail(c, "unauthorized", "Missing or invalid credentials.", 401);

    const row = await ingestSourceForToken(createDb(c.env.DB), token, source);
    if (!row) {
      console.warn(`[ingest] rejected ${source} push with unknown token`);
      return fail(c, "unauthorized", "Missing or invalid credentials.", 401);
    }

    c.set("ingestSourceId", row.id);
    c.set("ingestSourceLabel", row.label);
    c.set("userId", row.userId);
    await next();
  });
}
