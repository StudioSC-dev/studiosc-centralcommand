import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { getOrCreateUser } from "../services/users";
import { getSession } from "../lib/session";
import { allowUserDaily } from "../services/rate-limit";
import { fail } from "../lib/response";

/**
 * `sessionAuth` guards user-facing routes. Identity is resolved in priority order:
 *
 *   1. App session cookie (`cc_session`) — the primary path once Google sign-in
 *      (or the demo entry) has issued one. Carries the userId directly, plus the
 *      demo flag, so no DB lookup is needed for it.
 *   2. Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) — TRANSITIONAL fallback
 *      so production keeps working while Access still fronts the site. Removed in
 *      Stage 3 once the Access apps are deleted.
 *   3. `DEV_AUTH_EMAIL` — local dev only (never set in prod).
 */

// JWKS sets are cached per team domain (jose caches the fetched keys internally).
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksByTeam.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, jwks);
  }
  return jwks;
}

export const sessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  // 1. App session cookie — preferred. Carries userId + demo flag directly.
  const session = await getSession(c);
  if (session) {
    c.set("userId", session.userId);
    c.set("userEmail", session.email);
    c.set("isDemo", session.demo);
    return backstopThenNext(c, next, session.userId, session.demo);
  }

  // 2/3. Resolve an email from the Access JWT (transitional) or the dev fallback.
  let email: string | undefined;

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwks(c.env.CF_ACCESS_TEAM_DOMAIN), {
        issuer: `https://${c.env.CF_ACCESS_TEAM_DOMAIN}`,
        audience: c.env.CF_ACCESS_AUD,
      });
      if (typeof payload.email === "string") email = payload.email;
    } catch {
      return fail(c, "unauthorized", "Invalid Access token.", 401);
    }
  } else if (c.env.DEV_AUTH_EMAIL) {
    // Local dev: no session and no Access in front, so trust the configured email.
    email = c.env.DEV_AUTH_EMAIL;
  }

  if (!email) {
    return fail(c, "unauthorized", "No authenticated identity.", 401);
  }

  const user = await getOrCreateUser(createDb(c.env.DB), email);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  c.set("isDemo", false);
  return backstopThenNext(c, next, user.id, false);
});

/**
 * Coarse per-user daily request ceiling — protects Workers/D1 from a single
 * abusive session. Skipped for demo (its user id is shared across all demo
 * visitors, so one abuser must not be able to lock everyone out).
 */
async function backstopThenNext(
  c: Context<AppEnv>,
  next: Next,
  userId: string,
  isDemo: boolean,
) {
  if (!isDemo) {
    const rl = await allowUserDaily(c.env, userId, "requests");
    if (!rl.allowed) return fail(c, "rate_limited", "Daily request limit reached.", 429);
  }
  await next();
}
