/**
 * Drizzle schema for Central Command (Cloudflare D1 / SQLite).
 *
 * Conventions:
 *   - Primary keys are UUID v7 TEXT (time-sortable, provider-agnostic).
 *   - Timestamps are epoch-millisecond INTEGERs.
 *   - Everything user-scoped carries `userId` — the app is multi-user by design.
 *
 * The auth tables (`users`, `authProviders`, `authCredentials`) are fully
 * specified. The data tables are intentionally minimal stubs in Phase 1
 * scaffolding — id / userId / timestamp plus a few core columns — to be
 * fleshed out per pillar in later sessions.
 */
import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// ─── Auth ────────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID v7
  email: text("email").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const authProviders = sqliteTable(
  "auth_providers",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(), // 'google' | 'microsoft' | 'local'
    providerId: text("provider_id"), // Google sub / Microsoft oid; null for local
    accessToken: text("access_token"), // null for local
    refreshToken: text("refresh_token"), // null for local
    expiresAt: integer("expires_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id), // local provider only
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─── Per-user settings ───────────────────────────────────────────────────────

// One row per user. Location is defaulted from Cloudflare edge geo at sign-up
// (request.cf), confirmed by the user, then persisted here. `timezone` also
// drives the Riot refresh cron's "8am/8pm local" rule.
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  timezone: text("timezone"), // IANA name, e.g. "America/New_York"
  homeLat: real("home_lat"),
  homeLon: real("home_lon"),
  locationLabel: text("location_label"), // human-readable, e.g. "Brooklyn, NY"
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─── Data (Phase 1 stubs) ────────────────────────────────────────────────────

export const calendarEvents = sqliteTable("calendar_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title"),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
});

export const weatherSnapshots = sqliteTable("weather_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  capturedAt: integer("captured_at").notNull(),
});

export const fitnessLogs = sqliteTable("fitness_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  activity: text("activity"),
  durationMin: integer("duration_min"),
  intensity: integer("intensity"), // 1–5
  loggedAt: integer("logged_at").notNull(),
});

export const nutritionLogs = sqliteTable("nutrition_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  meal: text("meal"), // optional label, e.g. "breakfast"
  calories: integer("calories"),
  protein: integer("protein"), // grams
  carbs: integer("carbs"), // grams
  fat: integer("fat"), // grams
  loggedAt: integer("logged_at").notNull(),
});

export const sleepLogs = sqliteTable("sleep_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  date: text("date"), // night the sleep is attributed to (YYYY-MM-DD)
  durationMin: integer("duration_min"),
  quality: integer("quality"), // 1–5
  loggedAt: integer("logged_at").notNull(),
});

export const gamingProviders = sqliteTable(
  "gaming_providers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(), // 'riot' | 'steam'
    game: text("game").notNull(), // 'league' | 'valorant' | 'dota2' | 'cs2'
    riotId: text("riot_id"), // user-provided; never hardcoded
    createdAt: integer("created_at").notNull(),
  },
  (table) => [unique().on(table.userId, table.provider, table.game)],
);

export const gamingSnapshots = sqliteTable("gaming_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  capturedAt: integer("captured_at").notNull(),
});

export const performanceScores = sqliteTable("performance_scores", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  score: integer("score").notNull(),
  scoredAt: integer("scored_at").notNull(),
});

export const newsItems = sqliteTable("news_items", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  title: text("title"),
  url: text("url"),
  publishedAt: integer("published_at").notNull(),
  fetchedAt: integer("fetched_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
