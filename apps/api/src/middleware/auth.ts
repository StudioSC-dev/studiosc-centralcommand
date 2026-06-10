import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { getOrCreateUser } from "../services/users";
import { getSession } from "../lib/session";
import { allowUserDaily } from "../services/rate-limit";
import { fail } from "../lib/response";

/**
 * `sessionAuth` guards user-facing routes. Identity comes from the app session
 * cookie (`cc_session`), issued by Google sign-in or the demo entry. Locally,
 * `DEV_AUTH_EMAIL` stands in when no cookie is present (never set in prod).
 *
 * Cloudflare Access has been removed — the app authenticates itself now.
 */
export const sessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getSession(c);
  if (session) {
    c.set("userId", session.userId);
    c.set("userEmail", session.email);
    c.set("isDemo", session.demo);
    return backstopThenNext(c, next, session.userId, session.demo);
  }

  // Local dev only: no session cookie, so trust the configured dev email.
  if (c.env.DEV_AUTH_EMAIL) {
    const user = await getOrCreateUser(createDb(c.env.DB), c.env.DEV_AUTH_EMAIL);
    c.set("userId", user.id);
    c.set("userEmail", user.email);
    c.set("isDemo", false);
    return backstopThenNext(c, next, user.id, false);
  }

  return fail(c, "unauthorized", "No authenticated identity.", 401);
});

/**
 * Coarse per-user daily request ceiling — protects Workers/D1 from a single
 * abusive session. Skipped for demo (its user id is shared across all demo
 * visitors, so one abuser must not be able to lock everyone out).
 */
async function backstopThenNext(c: Context<AppEnv>, next: Next, userId: string, isDemo: boolean) {
  if (!isDemo) {
    const rl = await allowUserDaily(c.env, userId, "requests");
    if (!rl.allowed) return fail(c, "rate_limited", "Daily request limit reached.", 429);
  }
  await next();
}
