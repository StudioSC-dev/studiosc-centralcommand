import { SignJWT, jwtVerify } from "jose";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv, Bindings } from "../env";

/**
 * App session: a stateless signed JWT carried in an HttpOnly cookie. This is
 * how the app authenticates its own users once Google sign-in (or the demo
 * entry) has resolved an identity — no Cloudflare Access needed, no per-request
 * DB/KV read. Signed with `SESSION_SECRET` (base64 of 32 random bytes).
 */

export const SESSION_COOKIE = "cc_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  email: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  /** Read-only public demo session (no DB writes, no third-party calls). */
  demo: boolean;
}

/** Decode the base64 secret into the HMAC key bytes. */
function signingKey(env: Bindings): Uint8Array {
  return Uint8Array.from(atob(env.SESSION_SECRET), (ch) => ch.charCodeAt(0));
}

/** Mint a signed session token for a resolved user. */
export async function issueSession(
  env: Bindings,
  user: SessionUser,
  demo = false,
): Promise<string> {
  return new SignJWT({ email: user.email, demo })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(signingKey(env));
}

/** Verify a session token, returning its payload or null if invalid/expired. */
export async function readSession(
  env: Bindings,
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env));
    if (typeof payload.sub === "string" && typeof payload.email === "string") {
      return { userId: payload.sub, email: payload.email, demo: payload.demo === true };
    }
  } catch {
    // Invalid signature / expired / malformed — treated as no session.
  }
  return null;
}

/** Set the session cookie on the response. */
export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Clear the session cookie (logout / exit demo). */
export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Read + verify the session from the request cookie, if any. */
export async function getSession(c: Context<AppEnv>): Promise<SessionPayload | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return readSession(c.env, token);
}
