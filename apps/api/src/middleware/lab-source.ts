import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail } from "../lib/response";
import { sourceForToken } from "../services/lab";

/**
 * Bearer auth for the two lab ingest endpoints.
 *
 * These sit **outside** the session guard — the homelab agent has no cookie and
 * no browser — so they authenticate themselves, the same shape the Google
 * Calendar push webhook uses. Scope is one source row and one user: a leaked
 * token can write false status data for that one user and nothing else. It
 * grants no read access and no access to the lab itself (D9, categorically).
 *
 * **The 401 is uniform.** Unknown source and wrong token return the identical
 * body, so the endpoint cannot be used as an oracle to discover which source ids
 * exist. Detail goes to the log, never to the caller.
 */
export const labSourceAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) return fail(c, "unauthorized", "Missing or invalid credentials.", 401);

  const source = await sourceForToken(createDb(c.env.DB), token);
  if (!source) {
    console.warn("[lab] rejected push with unknown token");
    return fail(c, "unauthorized", "Missing or invalid credentials.", 401);
  }

  c.set("labSourceId", source.id);
  c.set("labSourceLabel", source.label);
  c.set("userId", source.userId);
  await next();
});

/**
 * Refuse a body larger than `maxBytes` **before parsing it**.
 *
 * Checked on `Content-Length` rather than after `await c.req.json()`, because
 * the point is not to spend the Worker's CPU parsing a payload we have already
 * decided to reject. A request with no length header is let through to the
 * parser, which has its own limits — this is a cheap first gate, not the only one.
 */
export function bodyCap(maxBytes: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const declared = Number(c.req.header("Content-Length") ?? "0");
    if (declared > maxBytes) {
      return fail(c, "payload_too_large", "Body exceeds the size cap.", 413);
    }
    await next();
  });
}
