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

// ─── Per-user profile ─────────────────────────────────────────────────────────

// Collected at onboarding (displayName/birthdate/sex) plus optional body metrics
// editable later on the profile page. Feeds age/sex-aware insights.
export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  displayName: text("display_name"),
  birthdate: text("birthdate"), // YYYY-MM-DD
  sex: text("sex"), // 'male' | 'female' | 'other'
  heightCm: integer("height_cm"), // optional
  weightKg: real("weight_kg"), // optional
  activityLevel: text("activity_level"), // optional: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  // Saved League/Riot identity — drives auto-connect of the gaming pillar from
  // the user's profile (the in-card connect form remains as a fallback).
  riotId: text("riot_id"), // user-provided "gameName#tagLine"; never hardcoded
  riotRegion: text("riot_region"), // platform id, e.g. 'sg2' | 'na1' | 'euw1'
  createdAt: integer("created_at").notNull(),
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
  units: text("units"), // 'metric' | 'imperial' — weather display preference (null → metric)
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

// One representative snapshot per user per local day, upserted when the weather
// route serves fresh data. Feeds the weather↔outcome correlation insight.
// `tempC` is always canonical metric (converted from °F when fetched imperial).
export const weatherSnapshots = sqliteTable(
  "weather_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    date: text("date"), // local day key (YYYY-MM-DD)
    tempC: real("temp_c"), // canonical metric temperature
    condition: text("condition"), // e.g. "clear sky", "light rain"
    rain1h: real("rain_1h"), // mm in the last hour; null when dry
    capturedAt: integer("captured_at").notNull(),
  },
  (table) => [unique().on(table.userId, table.date)],
);

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
  hrv: integer("hrv"), // overnight/morning HRV reading (ms); displayed, not yet scored
  restingHr: integer("resting_hr"), // overnight/morning resting heart rate (bpm)
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
    riotId: text("riot_id"), // user-provided "gameName#tagLine"; never hardcoded
    region: text("region"), // platform id, e.g. 'sg2' | 'na1' | 'euw1'
    puuid: text("puuid"), // resolved + cached
    summonerId: text("summoner_id"), // resolved + cached (for league-v4)
    createdAt: integer("created_at").notNull(),
  },
  (table) => [unique().on(table.userId, table.provider, table.game)],
);

// One table for both match and rank snapshots (CLAUDE.md), discriminated by
// `kind`. Match columns describe a single game; rank columns a ranked-queue
// standing at `capturedAt`.
export const gamingSnapshots = sqliteTable("gaming_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  game: text("game").notNull(), // 'league' | …
  kind: text("kind").notNull(), // 'match' | 'rank'
  capturedAt: integer("captured_at").notNull(),

  // kind = 'match'
  matchId: text("match_id"),
  champion: text("champion"),
  position: text("position"), // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY
  queueId: integer("queue_id"),
  win: integer("win"), // 0 | 1
  kills: integer("kills"),
  deaths: integer("deaths"),
  assists: integer("assists"),
  cs: integer("cs"),
  durationSec: integer("duration_sec"),
  score: integer("score"), // role-normalized, non-authoritative

  // kind = 'rank'
  queueType: text("queue_type"), // 'solo' | 'flex'
  tier: text("tier"), // IRON … CHALLENGER
  division: text("division"), // I–IV
  leaguePoints: integer("league_points"),
  wins: integer("wins"),
  losses: integer("losses"),
});

export const performanceScores = sqliteTable(
  "performance_scores",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    date: text("date"), // day the score is for (YYYY-MM-DD)
    score: integer("score").notNull(),
    sleepScore: integer("sleep_score"),
    nutritionScore: integer("nutrition_score"),
    hrvScore: integer("hrv_score"),
    scoredAt: integer("scored_at").notNull(),
  },
  // One stored score per user per day (upserted).
  (table) => [unique().on(table.userId, table.date)],
);

// Native task list — "current priorities", independent of calendar time.
// Phase 2 will add external sources (Linear/Jira/Trello) feeding the same table
// via `source` / `externalId`.
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  priority: text("priority").notNull().default("med"), // 'high' | 'med' | 'low'
  status: text("status").notNull().default("open"), // 'open' | 'done'
  position: integer("position").notNull().default(0), // manual ordering within a priority
  source: text("source").notNull().default("native"), // 'native' | 'linear' | 'jira' | 'trello'
  externalId: text("external_id"), // id in the source system (null for native)
  deadline: integer("deadline"), // optional due date (epoch ms) — drives Eisenhower urgency
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
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
