import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import {
  buildAuthorizeUrl,
  CALENDAR_SCOPES,
  exchangeCode,
  generatePkce,
  LOGIN_SCOPES,
  randomState,
  verifyGoogleIdToken,
} from "../services/google-oauth";
import { storeGoogleTokens } from "../services/google-token";
import { getOrCreateUser } from "../services/users";
import { isProfileComplete } from "../services/profile";
import { getSession, issueSession, setSessionCookie, clearSessionCookie } from "../lib/session";
import { publicAuthRateLimit } from "../middleware/rate-limit";
import { DEMO_EMAIL, DEMO_USER_ID } from "../demo/constants";

type Purpose = "login" | "connect";

/** Where the PKCE verifier + purpose are parked between redirect and callback. */
const stateKey = (state: string) => `oauth:google:${state}`;

/** Derive the registered redirect URI from the current request's origin. */
function callbackUrl(reqUrl: string): string {
  return `${new URL(reqUrl).origin}/api/auth/google/callback`;
}

/** Begin a Google OAuth flow for the given purpose (login vs calendar connect). */
async function startGoogle(c: Context<AppEnv>, purpose: Purpose) {
  const { verifier, challenge } = await generatePkce();
  const state = randomState();
  await c.env.CACHE.put(stateKey(state), JSON.stringify({ verifier, purpose }), {
    expirationTtl: 600,
  });
  const url = buildAuthorizeUrl({
    clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirectUri: callbackUrl(c.req.url),
    state,
    challenge,
    scopes: purpose === "login" ? LOGIN_SCOPES : CALENDAR_SCOPES,
    offline: purpose === "connect", // a refresh token is only needed for Calendar
  });
  return c.redirect(url);
}

/**
 * Public auth routes — no session required (sign-in starts/ends here).
 *   GET  /api/auth/login/google      → begin sign-in (minimal scopes)
 *   GET  /api/auth/google/callback   → shared callback (login | connect)
 *   POST /api/auth/logout            → clear the session cookie
 */
export const authPublic = new Hono<AppEnv>()
  .use("*", publicAuthRateLimit)
  .get("/login/google", (c) => startGoogle(c, "login"))
  .get("/google/callback", async (c) => {
    const error = c.req.query("error");
    if (error) return fail(c, "oauth_error", `Google returned: ${error}`, 400);

    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return fail(c, "oauth_error", "Missing code or state.", 400);

    const stored = await c.env.CACHE.get(stateKey(state));
    if (!stored) return fail(c, "oauth_error", "Invalid or expired state.", 400);
    await c.env.CACHE.delete(stateKey(state));
    const { verifier, purpose } = JSON.parse(stored) as { verifier: string; purpose: Purpose };

    const tokens = await exchangeCode({
      code,
      verifier,
      redirectUri: callbackUrl(c.req.url),
      clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    });
    const { sub, email } = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_OAUTH_CLIENT_ID);

    if (purpose === "login") {
      // Google sign-in IS the authentication: resolve our user and start a session.
      const user = await getOrCreateUser(createDb(c.env.DB), email);
      const token = await issueSession(c.env, user);
      setSessionCookie(c, token);
      return c.redirect("/");
    }

    // Calendar connect: attach the tokens to the already-signed-in user.
    const session = await getSession(c);
    if (!session) return fail(c, "unauthorized", "Sign in before connecting Calendar.", 401);
    await storeGoogleTokens(createDb(c.env.DB), c.env, session.userId, sub, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    return c.redirect("/?connected=google");
  })
  .post("/logout", (c) => {
    clearSessionCookie(c);
    return ok(c, { ok: true });
  })
  // Enter the public read-only demo: a session for the shared seeded demo user.
  .get("/demo", async (c) => {
    const token = await issueSession(c.env, { id: DEMO_USER_ID, email: DEMO_EMAIL }, true);
    setSessionCookie(c, token);
    return c.redirect("/");
  });

/**
 * Session-guarded auth routes (mounted behind `sessionAuth`).
 *   GET /api/auth/me        → current identity
 *   GET /api/auth/google    → begin Calendar connect (incremental consent)
 */
export const authGuarded = new Hono<AppEnv>()
  .get("/me", async (c) => {
    const profileComplete = await isProfileComplete(createDb(c.env.DB), c.get("userId"));
    return ok(c, {
      id: c.get("userId"),
      email: c.get("userEmail"),
      demo: c.get("isDemo"),
      profileComplete,
    });
  })
  .get("/google", (c) => {
    if (c.get("isDemo")) return fail(c, "demo_read_only", "The demo can't connect accounts.", 403);
    return startGoogle(c, "connect");
  });
