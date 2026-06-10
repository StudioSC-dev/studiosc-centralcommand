import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../lib/response";

/**
 * Read-only guard for the public demo session. All demo visitors share one
 * seeded user, so any write would corrupt the shared dataset (the "Google Docs"
 * problem) and could hit the third-party keys. We block every state-changing
 * method; safe GETs pass through. (Weather/calendar additionally serve fixtures,
 * so even their cache-miss fetches never fire in demo.)
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const demoReadOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("isDemo") && !SAFE_METHODS.has(c.req.method)) {
    return fail(c, "demo_read_only", "The demo is read-only. Sign in to make changes.", 403);
  }
  await next();
});
