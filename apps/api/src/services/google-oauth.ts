import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google OAuth 2.0 protocol layer (no DB access — see google-token.ts for that).
 *
 * Authorization Code flow with PKCE. We request offline access so Google
 * returns a refresh token, which is what lets us call the Calendar API on the
 * user's behalf later without re-prompting.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// Google's id_token signing keys; jose caches the fetched JWKS internally.
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Random, URL-safe state value for CSRF protection. */
export function randomState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/** Generate a PKCE verifier + S256 challenge pair. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

/** Build the Google consent-screen URL the browser is redirected to. */
export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline"); // request a refresh token
  url.searchParams.set("prompt", "consent"); // ensure a refresh token is returned
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  token_type: string;
  scope: string;
}

/** Exchange an authorization code (with the PKCE verifier) for tokens. */
export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code_verifier: opts.verifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export interface RefreshedToken {
  access_token: string;
  expires_in: number;
}

/**
 * Thrown when a stored Google credential is unrecoverable and the user must
 * re-consent — e.g. the refresh token expired (7-day limit while the OAuth app
 * is in "Testing" publishing status) or was revoked. Callers should surface a
 * reconnect prompt rather than a generic error.
 */
export class GoogleReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleReauthRequiredError";
  }
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<RefreshedToken> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // An expired or revoked refresh token comes back as 400 invalid_grant.
    // That is terminal — only re-consent fixes it, so flag it distinctly from
    // a transient upstream failure (which should stay a 500).
    if (res.status === 400 && body.includes("invalid_grant")) {
      throw new GoogleReauthRequiredError("Google refresh token is invalid or expired.");
    }
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  return (await res.json()) as RefreshedToken;
}

/** Verify a Google id_token's signature + claims, returning the subject + email. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<{ sub: string; email: string }> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!sub || !email) throw new Error("Google id_token missing sub/email claim");
  return { sub, email };
}
