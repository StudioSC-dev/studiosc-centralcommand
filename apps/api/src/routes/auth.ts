import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail } from "../lib/response";
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  randomState,
  verifyGoogleIdToken,
} from "../services/google-oauth";
import { storeGoogleTokens } from "../services/google-token";

/** Where the PKCE verifier is parked between redirect and callback. */
const stateKey = (state: string) => `oauth:google:${state}`;

/** Derive the registered redirect URI from the current request's origin. */
function callbackUrl(reqUrl: string): string {
  return `${new URL(reqUrl).origin}/api/auth/google/callback`;
}

export const auth = new Hono<AppEnv>()
  // Begin the Google OAuth connect flow.
  .get("/google", async (c) => {
    const { verifier, challenge } = await generatePkce();
    const state = randomState();

    // Park the verifier server-side (KV), keyed by the opaque state value.
    await c.env.CACHE.put(stateKey(state), JSON.stringify({ verifier }), {
      expirationTtl: 600,
    });

    const url = buildAuthorizeUrl({
      clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
      redirectUri: callbackUrl(c.req.url),
      state,
      challenge,
    });
    return c.redirect(url);
  })
  // Google redirects back here with the authorization code.
  .get("/google/callback", async (c) => {
    const error = c.req.query("error");
    if (error) return fail(c, "oauth_error", `Google returned: ${error}`, 400);

    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return fail(c, "oauth_error", "Missing code or state.", 400);

    const stored = await c.env.CACHE.get(stateKey(state));
    if (!stored) return fail(c, "oauth_error", "Invalid or expired state.", 400);
    await c.env.CACHE.delete(stateKey(state));
    const { verifier } = JSON.parse(stored) as { verifier: string };

    const tokens = await exchangeCode({
      code,
      verifier,
      redirectUri: callbackUrl(c.req.url),
      clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    });

    // Verify the id_token and associate the connection with the already-
    // authenticated user (resolved by accessAuth from the Access identity).
    const { sub } = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_OAUTH_CLIENT_ID);

    await storeGoogleTokens(createDb(c.env.DB), c.env, c.get("userId"), sub, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Back to the dashboard. (Frontend lives at the site root in production.)
    return c.redirect("/?connected=google");
  });
