import { eq } from "drizzle-orm";
import { users, userSettings } from "@central-command/db";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

export interface UserRecord {
  id: string;
  email: string;
  createdAt: number;
}

/** Partial location/timezone defaults, e.g. sourced from Cloudflare edge geo. */
export interface SettingsInput {
  timezone?: string | null;
  homeLat?: number | null;
  homeLon?: number | null;
  locationLabel?: string | null;
}

/**
 * Resolve the canonical user for an email, creating the `users` row (with a
 * fresh UUID v7) on first sight. This is the bridge between an external
 * identity (a verified Access/OAuth email) and our own user id.
 */
export async function getOrCreateUser(db: Database, email: string): Promise<UserRecord> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existing) return existing;

  const record: UserRecord = { id: newId(), email, createdAt: Date.now() };
  await db.insert(users).values(record);
  return record;
}

/** Fetch a user's settings row, or `undefined` if they haven't set one yet. */
export async function getUserSettings(db: Database, userId: string) {
  return db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
}

/**
 * Create or update a user's settings (location + timezone). Used by the sign-up
 * flow after the user confirms the Cloudflare-geo defaults.
 */
export async function upsertUserSettings(
  db: Database,
  userId: string,
  input: SettingsInput,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(userSettings)
    .values({ userId, ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...input, updatedAt: now },
    });
}
