import { and, eq } from "drizzle-orm";
import { authProviders } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { refreshAccessToken } from "./google-oauth";

const PROVIDER = "google";

/** Refresh the access token this many ms before its actual expiry. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Persist Google tokens for a user, encrypting them at rest. On re-auth Google
 * may omit the refresh token; in that case we keep the existing one.
 */
export async function storeGoogleTokens(
  db: Database,
  env: Bindings,
  userId: string,
  providerId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt: number },
): Promise<void> {
  const encAccess = await encryptSecret(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const encRefresh = tokens.refreshToken
    ? await encryptSecret(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY)
    : null;

  const set: Partial<typeof authProviders.$inferInsert> = {
    providerId,
    accessToken: encAccess,
    expiresAt: tokens.expiresAt,
  };
  if (encRefresh) set.refreshToken = encRefresh;

  await db
    .insert(authProviders)
    .values({
      userId,
      provider: PROVIDER,
      providerId,
      accessToken: encAccess,
      refreshToken: encRefresh,
      expiresAt: tokens.expiresAt,
    })
    .onConflictDoUpdate({
      target: [authProviders.userId, authProviders.provider],
      set,
    });
}

/** The user's stored Google provider row, or `undefined` if not connected. */
export async function getGoogleProvider(db: Database, userId: string) {
  return db
    .select()
    .from(authProviders)
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, PROVIDER)))
    .get();
}

/**
 * Return a valid Google access token for a user, transparently refreshing it
 * (and re-persisting) when it's within the expiry skew window.
 */
export async function getValidGoogleAccessToken(
  db: Database,
  env: Bindings,
  userId: string,
): Promise<string> {
  const row = await db
    .select()
    .from(authProviders)
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, PROVIDER)))
    .get();

  if (!row || !row.accessToken) {
    throw new Error("Google account not connected for this user.");
  }

  if (row.expiresAt && row.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    return decryptSecret(row.accessToken, env.TOKEN_ENCRYPTION_KEY);
  }

  if (!row.refreshToken) {
    throw new Error("Google access token expired and no refresh token is stored; reconnect.");
  }

  const refreshToken = await decryptSecret(row.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  const refreshed = await refreshAccessToken({
    refreshToken,
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  });

  const expiresAt = Date.now() + refreshed.expires_in * 1000;
  const encAccess = await encryptSecret(refreshed.access_token, env.TOKEN_ENCRYPTION_KEY);
  await db
    .update(authProviders)
    .set({ accessToken: encAccess, expiresAt })
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, PROVIDER)));

  return refreshed.access_token;
}
