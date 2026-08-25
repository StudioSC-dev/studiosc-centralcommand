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
 * This middleware deliberately performs NO rate limiting. A coarse per-user
 * daily request ceiling used to live here and was removed in Session 43: it
 * cost one KV write per request, which is the wrong shape for KV (a read-heavy
 * cache with ~1k writes/day) and blew the free-tier write cap on its own. The
 * limits that matter — the ones protecting third-party keys — sit on the routes
 * that actually call out, and only fire on a cache miss. See HANDOVER.md
 * Session 43 before reintroducing anything per-request here.
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
