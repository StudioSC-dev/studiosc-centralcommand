import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { allowIpWindow } from "../services/rate-limit";
import { fail } from "../lib/response";

/**
 * Per-IP limiter for the public auth group. These routes run before any session
 * exists, so the per-user daily backstop in `sessionAuth` can't protect them —
 * the only stable identifier is the caller's IP.
 *
 * `CF-Connecting-IP` is set by Cloudflare's edge and cannot be spoofed by the
 * client (any inbound value is overwritten). Locally there's no edge, so it may
 * be absent — we fall back to a shared "local" bucket, which is fine for dev.
 */
export const publicAuthRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  const rl = await allowIpWindow(c.env, ip, "auth");
  if (!rl.allowed) {
    c.header("Retry-After", String(rl.retryAfterSec));
    return fail(c, "rate_limited", "Too many requests. Please try again shortly.", 429);
  }
  await next();
});
