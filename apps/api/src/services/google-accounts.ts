import { and, eq } from "drizzle-orm";
import { authProviders } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getUserSettings, upsertUserSettings } from "./users";
import { refreshAccessToken, GoogleReauthRequiredError } from "./google-oauth";

const EXPIRY_SKEW_MS = 60_000;

export interface StoredGoogleAccount {
  id: string;
  label: string;
  email: string;
  providerId: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

export function parseGoogleAccounts(raw: string | null): StoredGoogleAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredGoogleAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.email === "string" &&
        typeof a.refreshToken === "string" &&
        typeof a.accessToken === "string" &&
        typeof a.expiresAt === "number",
    );
  } catch {
    return [];
  }
}

export async function getGoogleAccounts(
  db: Database,
  userId: string,
): Promise<StoredGoogleAccount[]> {
  const settings = await getUserSettings(db, userId);
  let accounts = parseGoogleAccounts(settings?.googleAccounts ?? null);

  if (accounts.length === 0) {
    const legacy = await db
      .select()
      .from(authProviders)
      .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, "google")))
      .get();

    if (legacy?.refreshToken && legacy.accessToken) {
      const account: StoredGoogleAccount = {
        id: "legacy",
        label: "Google",
        email: "",
        providerId: legacy.providerId ?? "",
        refreshToken: legacy.refreshToken,
        accessToken: legacy.accessToken,
        expiresAt: legacy.expiresAt ?? 0,
      };
      accounts = [account];
      await upsertUserSettings(db, userId, {
        googleAccounts: JSON.stringify(accounts),
      });
    }
  }

  return accounts;
}

export async function addGoogleAccount(
  db: Database,
  env: Bindings,
  userId: string,
  account: {
    label: string;
    email: string;
    providerId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  },
): Promise<string> {
  const settings = await getUserSettings(db, userId);
  const accounts = parseGoogleAccounts(settings?.googleAccounts ?? null);

  const id = crypto.randomUUID().slice(0, 8);
  const encAccess = await encryptSecret(account.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const encRefresh = await encryptSecret(account.refreshToken, env.TOKEN_ENCRYPTION_KEY);

  accounts.push({
    id,
    label: account.label,
    email: account.email,
    providerId: account.providerId,
    refreshToken: encRefresh,
    accessToken: encAccess,
    expiresAt: account.expiresAt,
  });

  await upsertUserSettings(db, userId, {
    googleAccounts: JSON.stringify(accounts),
  });

  return id;
}

export async function removeGoogleAccount(
  db: Database,
  userId: string,
  accountId: string,
): Promise<number> {
  const settings = await getUserSettings(db, userId);
  let accounts = parseGoogleAccounts(settings?.googleAccounts ?? null);
  accounts = accounts.filter((a) => a.id !== accountId);

  await upsertUserSettings(db, userId, {
    googleAccounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
  });

  return accounts.length;
}

export async function refreshAccountToken(
  env: Bindings,
  account: StoredGoogleAccount,
): Promise<{ accessToken: string; expiresAt: number }> {
  const refreshToken = await decryptSecret(account.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  const refreshed = await refreshAccessToken({
    refreshToken,
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  });
  return {
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  };
}

export async function getValidAccountToken(
  db: Database,
  env: Bindings,
  userId: string,
  accountId: string,
): Promise<string> {
  const settings = await getUserSettings(db, userId);
  const accounts = parseGoogleAccounts(settings?.googleAccounts ?? null);
  const account = accounts.find((a) => a.id === accountId);

  if (!account) {
    throw new Error(`Google account ${accountId} not found for user.`);
  }

  if (account.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    return decryptSecret(account.accessToken, env.TOKEN_ENCRYPTION_KEY);
  }

  if (!account.refreshToken) {
    throw new GoogleReauthRequiredError("No refresh token stored for this account.");
  }

  const refreshed = await refreshAccountToken(env, account);
  const encAccess = await encryptSecret(refreshed.accessToken, env.TOKEN_ENCRYPTION_KEY);

  account.accessToken = encAccess;
  account.expiresAt = refreshed.expiresAt;
  await upsertUserSettings(db, userId, {
    googleAccounts: JSON.stringify(accounts),
  });

  return refreshed.accessToken;
}

export async function getFirstValidToken(
  db: Database,
  env: Bindings,
  userId: string,
): Promise<{ token: string; accountId: string } | null> {
  const accounts = await getGoogleAccounts(db, userId);
  if (accounts.length === 0) return null;

  const token = await getValidAccountToken(db, env, userId, accounts[0]!.id);
  return { token, accountId: accounts[0]!.id };
}
