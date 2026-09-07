import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, Bindings } from "../env";
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
import { disconnectGoogle, storeGoogleTokens } from "../services/google-token";
import { addGoogleAccount, getGoogleAccounts, removeGoogleAccount } from "../services/google-accounts";
import { ensureChannel, webhookAddress } from "../services/calendar-channels";
import { getOrCreateUser } from "../services/users";
import { isProfileComplete } from "../services/profile";
import { getSession, issueSession, setSessionCookie, clearSessionCookie } from "../lib/session";
import { publicAuthRateLimit } from "../middleware/rate-limit";
import { DEMO_EMAIL, DEMO_USER_ID } from "../demo/constants";

type Purpose = "login" | "connect" | "add-google";

/** Where the PKCE verifier + purpose are parked between redirect and callback. */
const stateKey = (state: string) => `oauth:google:${state}`;

/**
 * The registered Google redirect URI. Built from the configured `APP_ORIGIN`,
 * never from the incoming request: `wrangler dev` simulates the `[[routes]]`
 * hostname, so the Worker sees the production host locally while wrangler
 * rewrites outbound `Location` headers back to localhost. Deriving it from the
 * request therefore sent one value on the authorize leg and a different one on
 * the token exchange, and Google rejected the exchange with `invalid_grant`.
 *
 * Both legs must send a byte-identical value, so both call this.
 */
function callbackUrl(env: Bindings): string {
  return `${appOrigin(env)}/api/auth/google/callback`;
}

/** The app's browser-facing origin, without a trailing slash. */
function appOrigin(env: Bindings): string {
  return env.APP_ORIGIN.replace(/\/+$/, "");
}

/**
 * Absolute redirect back into the SPA. In dev the SPA is on a different port
 * from the Worker, so a root-relative `/` would strand the browser on the
 * Worker's origin, which serves no frontend.
 */
function toApp(c: Context<AppEnv>, path: string) {
  return c.redirect(`${appOrigin(c.env)}${path}`);
}

/** Begin a Google OAuth flow for the given purpose. */
async function startGoogle(c: Context<AppEnv>, purpose: Purpose, label?: string) {
  const { verifier, challenge } = await generatePkce();
  const state = randomState();
  await c.env.CACHE.put(
    stateKey(state),
    JSON.stringify({ verifier, purpose, ...(label && { label }) }),
    { expirationTtl: 600 },
  );
  const needsCalendar = purpose === "connect" || purpose === "add-google";
  const url = buildAuthorizeUrl({
    clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirectUri: callbackUrl(c.env),
    state,
    challenge,
    scopes: needsCalendar ? CALENDAR_SCOPES : LOGIN_SCOPES,
    offline: needsCalendar,
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
    if (error) return toApp(c, `/?auth_error=${encodeURIComponent(error)}`);

    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return toApp(c, "/?auth_error=missing_code_or_state");

    const stored = await c.env.CACHE.get(stateKey(state));
    if (!stored) return toApp(c, "/?auth_error=invalid_or_expired_state");
    await c.env.CACHE.delete(stateKey(state));
    const { verifier, purpose, label } = JSON.parse(stored) as {
      verifier: string;
      purpose: Purpose;
      label?: string;
    };

    let tokens;
    try {
      tokens = await exchangeCode({
        code,
        verifier,
        redirectUri: callbackUrl(c.env),
        clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
      });
    } catch (err) {
      console.error("[auth] Google token exchange failed:", err);
      return toApp(c, "/?auth_error=token_exchange_failed");
    }

    let sub: string;
    let email: string;
    try {
      ({ sub, email } = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_OAUTH_CLIENT_ID));
    } catch (err) {
      console.error("[auth] Google id_token verification failed:", err);
      return toApp(c, "/?auth_error=id_verification_failed");
    }

    if (purpose === "login") {
      const user = await getOrCreateUser(createDb(c.env.DB), email);
      const token = await issueSession(c.env, user);
      setSessionCookie(c, token);
      return toApp(c, "/");
    }

    // Both "connect" and "add-google" require an authenticated user.
    const session = await getSession(c);
    const userId = session?.userId
      ?? (c.env.DEV_AUTH_EMAIL
        ? (await getOrCreateUser(createDb(c.env.DB), c.env.DEV_AUTH_EMAIL)).id
        : null);
    if (!userId) return toApp(c, "/?auth_error=not_signed_in");

    if (purpose === "add-google") {
      if (!tokens.refresh_token) {
        return toApp(c, "/settings?auth_error=no_refresh_token");
      }
      await addGoogleAccount(createDb(c.env.DB), c.env, userId, {
        label: label || email.split("@")[0]!,
        email,
        providerId: sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
      return toApp(c, "/settings?connected=google");
    }

    // Legacy "connect" purpose — stores in auth_providers (backward compat).
    await storeGoogleTokens(createDb(c.env.DB), c.env, userId, sub, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    c.executionCtx.waitUntil(
      ensureChannel(createDb(c.env.DB), userId, tokens.access_token, webhookAddress(c.env)),
    );
    return toApp(c, "/?connected=google");
  })
  .post("/logout", (c) => {
    clearSessionCookie(c);
    return ok(c, { ok: true });
  })
  // Enter the public read-only demo: a session for the shared seeded demo user.
  .get("/demo", async (c) => {
    const token = await issueSession(c.env, { id: DEMO_USER_ID, email: DEMO_EMAIL }, true);
    setSessionCookie(c, token);
    return toApp(c, "/");
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
  })
  .get("/google/add", (c) => {
    if (c.get("isDemo")) return fail(c, "demo_read_only", "The demo can't connect accounts.", 403);
    const label = c.req.query("label") || undefined;
    return startGoogle(c, "add-google", label);
  })
  .get("/google/accounts", async (c) => {
    const accounts = await getGoogleAccounts(createDb(c.env.DB), c.get("userId"));
    return ok(c, {
      accounts: accounts.map((a) => ({ id: a.id, label: a.label, email: a.email })),
    });
  })
  .delete("/google/accounts/:id", async (c) => {
    const accountId = c.req.param("id");
    await removeGoogleAccount(createDb(c.env.DB), c.get("userId"), accountId);
    return ok(c, { removed: true });
  })
  .post("/google/disconnect", async (c) => {
    await disconnectGoogle(createDb(c.env.DB), c.env, c.get("userId"));
    return ok(c, { connected: false });
  });
