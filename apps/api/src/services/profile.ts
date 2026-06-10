import { eq } from "drizzle-orm";
import { userProfiles } from "@central-command/db";
import type { ProfileInput, UserProfile } from "@central-command/types";
import type { Database } from "../lib/db";

type ProfileRow = typeof userProfiles.$inferSelect;

const toProfile = (r: ProfileRow): UserProfile => ({
  userId: r.userId,
  displayName: r.displayName ?? null,
  birthdate: r.birthdate ?? null,
  sex: (r.sex as UserProfile["sex"]) ?? null,
  heightCm: r.heightCm ?? null,
  weightKg: r.weightKg ?? null,
  activityLevel: (r.activityLevel as UserProfile["activityLevel"]) ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** The user's profile row, or null if they haven't onboarded yet. */
export async function getProfile(db: Database, userId: string): Promise<UserProfile | null> {
  const row = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).get();
  return row ? toProfile(row) : null;
}

/** Onboarding is done once the three required fields are present. */
export async function isProfileComplete(db: Database, userId: string): Promise<boolean> {
  const p = await getProfile(db, userId);
  return !!(p && p.displayName && p.birthdate && p.sex);
}

/** Insert or partially update the profile. Only provided fields are written. */
export async function upsertProfile(
  db: Database,
  userId: string,
  input: ProfileInput,
): Promise<UserProfile> {
  const now = Date.now();
  // Build the partial set from only the keys present in the input.
  const fields: Partial<ProfileRow> = {};
  if (input.displayName !== undefined) fields.displayName = input.displayName;
  if (input.birthdate !== undefined) fields.birthdate = input.birthdate;
  if (input.sex !== undefined) fields.sex = input.sex;
  if (input.heightCm !== undefined) fields.heightCm = input.heightCm;
  if (input.weightKg !== undefined) fields.weightKg = input.weightKg;
  if (input.activityLevel !== undefined) fields.activityLevel = input.activityLevel;

  await db
    .insert(userProfiles)
    .values({
      userId,
      displayName: input.displayName ?? null,
      birthdate: input.birthdate ?? null,
      sex: input.sex ?? null,
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      activityLevel: input.activityLevel ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...fields, updatedAt: now },
    });

  return (await getProfile(db, userId)) as UserProfile;
}
