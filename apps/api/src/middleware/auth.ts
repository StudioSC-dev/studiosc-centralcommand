import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { getOrCreateUser } from "../services/users";
import { getSession } from "../lib/session";
import { fail } from "../lib/response";

/**
 * `sessionAuth` guards user-facing routes. Identity comes from the app session
 * cookie (`cc_session`), issued by Google sign-in or the demo entry. Locally,
 * `DEV_AUTH_EMAIL` stands in when no cookie is present (never set in prod).
 *
 * Cloudflare Access has been removed — the app authenticates itself now.
 *
 * **There is deliberately no per-request rate limit here.** A coarse per-user
 * daily counter used to live on this path and was removed twice — once in
 * Session 43 and again, for real, in Session 44 when it was found still running.
 * It failed in three ways at once:
 *
 * - It wrote to KV on *every* authenticated request, which is exactly what
 *   CLAUDE.md forbids. At ~2,880 requests/day from two 60s polling cards it was
 *   the single largest write source, and on its own over the 1,000/day free cap.
 * - Its own 2,000/day ceiling was *below* what one always-on dashboard generates,
 *   so the wall display locked itself out after ~16.7 hours and 429'd until UTC
 *   midnight. A limiter that reliably takes down the only user is not protection.
 * - KV is eventually consistent, so the count was approximate anyway.
 *
 * What still limits things: the per-third-party-API counters in
 * `services/rate-limit.ts`, which protect the shared free-tier keys and are
 * gated behind cache misses, so they cost a handful of writes a day. Abuse of
 * the API surface itself is a WAF rate-limiting rule — free, zero storage ops,
 * in front of the Worker — and is a **prerequisite for opening demo mode to the
 * public** (see HANDOVER.md). Until then the app is gated to a single account.
 */
export const sessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getSession(c);
  if (session) {
    c.set("userId", session.userId);
    c.set("userEmail", session.email);
    c.set("isDemo", session.demo);
    return next();
  }

  // Local dev only: no session cookie, so trust the configured dev email.
  if (c.env.DEV_AUTH_EMAIL) {
    const user = await getOrCreateUser(createDb(c.env.DB), c.env.DEV_AUTH_EMAIL);
    c.set("userId", user.id);
    c.set("userEmail", user.email);
    c.set("isDemo", false);
    return next();
  }

  return fail(c, "unauthorized", "No authenticated identity.", 401);
});
