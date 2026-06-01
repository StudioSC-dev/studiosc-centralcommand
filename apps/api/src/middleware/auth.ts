import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../lib/response";

/**
 * API auth middleware.
 *
 * Phase 1: the API layer is guarded by a static Bearer token (Worker secret).
 * The deployed dashboard is additionally fronted by Cloudflare Access, which
 * authenticates the human via Google SSO and forwards their identity in the
 * `Cf-Access-Authenticated-User-Email` header.
 *
 * User scoping is multi-user by design: the authenticated email is resolved to
 * a UUID v7 `userId`. Resolving/creating the user row in D1 is wired up in a
 * later session; for now we surface the Access email so every route can be
 * written user-scoped from the start.
 */
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const expected = `Bearer ${c.env.API_BEARER_TOKEN}`;

  if (!header || header !== expected) {
    return fail(c, "unauthorized", "Missing or invalid API token.", 401);
  }

  // Identity forwarded by Cloudflare Access. Until user resolution lands, fall
  // back to a placeholder so downstream code can rely on `userId` existing.
  const accessEmail = c.req.header("Cf-Access-Authenticated-User-Email");
  c.set("userId", accessEmail ?? "anonymous");

  await next();
});
