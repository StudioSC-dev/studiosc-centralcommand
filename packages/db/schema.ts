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
import { index, integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

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
  // The dashboard layout used to live here as three JSON columns —
  // `hidden_cards` (0012), `card_order` (0013) and `card_sizes` (0014). They
  // are now rows in `dashboard_cards`; see that table and docs/ui-suite.md D15.
  // Dropped in migration 0016, which backfills the rows first.
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─── Calendar push channels ──────────────────────────────────────────────────

// One Google Calendar watch channel per user. Google pushes change
// notifications to our webhook, which invalidates the user's cached calendar so
// the next poll refetches. `resourceId` is Google's opaque handle (needed to
// stop the channel); `token` is our secret, echoed back in the push headers so
// the unauthenticated webhook can validate + resolve the caller. Channels expire
// (≤7 days) and are renewed by cron before `expiration`.
export const calendarChannels = sqliteTable("calendar_channels", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  channelId: text("channel_id").notNull().unique(), // our UUID — the X-Goog-Channel-ID (webhook looks up by this)
  resourceId: text("resource_id").notNull(), // Google's handle — needed to stop it
  token: text("token").notNull(), // our secret — validates incoming push headers
  expiration: integer("expiration").notNull(), // epoch ms when Google stops pushing
  createdAt: integer("created_at").notNull(),
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

// ─── Saved dashboard layouts ─────────────────────────────────────────────────

// One row per user-defined layout preset (docs/ui-suite.md Phase 7). The three
// built-in presets are constants in `packages/types` and are NOT stored here —
// only arrangements a user has saved under a name of their own.
//
// This is a table rather than a fourth JSON column on `user_settings` (D12): a
// saved preset is a named entity with its own lifecycle — created, renamed,
// deleted, one at a time — where the three layout columns are the *exceptions*
// to one derived value (D4). Rows also mean two tabs saving different presets
// cannot clobber each other the way a read-modify-write on a shared blob would.
//
// `visible` stores the ROSTER, not the exceptions — the same inversion the
// built-in presets make, for the same reason (D12): a card that ships later
// must not silently gatecrash an arrangement someone deliberately pared down.
// The array is also the order, because packing depends on position (D9).
export const cardPresets = sqliteTable(
  "card_presets",
  {
    id: text("id").primaryKey(), // UUID v7
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(), // user-supplied, trimmed, unique per user
    visible: text("visible").notNull(), // JSON CardKey[] — roster in render order
    sizes: text("sizes"), // JSON CardSizes, sparse; null → every card 1x1
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  // Names are how the user tells presets apart, so two called "Morning" would
  // make the list unreadable. Enforced here as well as in the route, because a
  // race between two tabs would slip past a check-then-insert.
  (table) => [unique().on(table.userId, table.name)],
);

// ─── Dashboard layout (docs/ui-suite.md D15) ─────────────────────────────────
//
// One row per *exception*: a card this user has hidden, moved, or resized. The
// three JSON columns this replaces (`user_settings.hidden_cards` / `card_order`
// / `card_sizes`, migrations 0012–0014) each answered one third of the same
// question about the same nine keys, and every layout PATCH rewrote all three
// regardless of which had changed.
//
// **It is still "store the exceptions" (D4), just as rows.** A card with no row
// here is visible, at 1x1, in registry order — so a card that ships later needs
// no backfill, exactly as before. That is the property the consolidation had to
// preserve, and it is why `position` is nullable rather than a dense 0..n: keys
// with a position sort first, by it; keys without one follow in registry order,
// which is precisely what `resolveCardOrder()` already did to a partial array.
//
// The composite primary key is what a JSON blob could not express: two tabs
// hiding two different cards are now two independent upserts instead of a
// read-modify-write race on one string.
export const dashboardCards = sqliteTable(
  "dashboard_cards",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    card: text("card").notNull(), // CardKey
    // 0/1 rather than a bool column: SQLite has no boolean, and Drizzle's
    // `mode: "boolean"` would hide that from the migration SQL that backfills it.
    hidden: integer("hidden").notNull().default(0),
    // Null → "wherever registry order puts it". Not dense, and not unique: it
    // is a sort key, and gaps in it are the normal state of a sparse table.
    position: integer("position"),
    size: text("size"), // CardSize; null → 1x1
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.card] })],
);

// Geocode cache — place string → coordinates, for the "leave by" estimate.
//
// In D1 rather than KV on purpose: a cache miss is a write, and KV writes are
// this project's scarcest resource (see CLAUDE.md "KV Write Budget") while D1
// writes are not. Not keyed by user, because a place resolves the same for
// everyone and no user id belongs in a table of public coordinates.
//
// Misses are stored too (`resolved: 0`), so an unresolvable location — a room
// name, a typo — is not re-asked of the geocoder on every calendar refresh.
// `staleAfter` is what allows a retry eventually without allowing one constantly.
export const geocodeCache = sqliteTable(
  "geocode_cache",
  {
    // Normalised by normaliseQuery(): lowercased, whitespace collapsed.
    query: text("query").primaryKey(),
    lat: real("lat"),
    lon: real("lon"),
    label: text("label"),
    // 0/1 — SQLite has no boolean; matches dashboardCards.hidden.
    resolved: integer("resolved").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
    staleAfter: integer("stale_after").notNull(),
  },
  (table) => [index("geocode_cache_stale_after_idx").on(table.staleAfter)],
);

// ─── Notifications spine (docs/notifications.md) ─────────────────────────────
//
// ONE table, every source. The Zero Inbox direction is that notifications are a
// *spine*, not a card: every producer writes here (the homelab's ntfy bus first,
// Gmail and Slack later) and every delivery channel reads from here (the card
// today, web push and native toasts later). A per-source table would make each
// new source a migration and each new delivery channel a fan-in query.
//
// `source` is a plain TEXT discriminator rather than a CHECK or an enum column
// precisely so adding Gmail is a collector and not a schema change.
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(), // UUID v7
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    source: text("source").notNull(), // 'lab' | 'gmail' | 'slack' | …
    kind: text("kind").notNull().default("alert"), // source-specific: 'alert' | 'mention' | …
    // The producer's own id for this event — an ntfy message id for `lab`. This
    // is what makes ingest idempotent: ntfy delivery is at-least-once across
    // reconnects, so the consumer dedupes rather than trusting the stream.
    // Nullable, because a source that has no stable id still gets rows.
    externalId: text("external_id"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    priority: integer("priority").notNull().default(3), // ntfy's 1–5 scale
    tags: text("tags"), // JSON string[]
    publishedAt: integer("published_at").notNull(),
    status: text("status").notNull().default("unread"), // 'unread' | 'read' | 'dismissed'
    // Ships as a column with no UI. It is in the recorded design, it costs
    // nothing now, and adding it later is a migration.
    snoozeUntil: integer("snooze_until"),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    // Insert-or-ignore dedup. Scoped by user as well as source because two
    // users' labs are two different streams that may reuse ids.
    unique("notifications_source_external_idx").on(
      table.userId,
      table.source,
      table.externalId,
    ),
    // The card's only read: this user's unread feed, newest first.
    index("notifications_feed_idx").on(table.userId, table.status, table.publishedAt),
  ],
);

// One row per (user, source) — the card's badge row, and the only place a
// count-only source can live.
//
// WHY THIS IS NOT DERIVED. "All ntfy notifications" is a feed: real rows, each
// read or dismissed individually. "Unread emails: 12" is a counter — Gmail is
// never going to write four thousand rows into `notifications`, and a card that
// assumes it will gets rebuilt the day Gmail lands.
//
// `unreadCount` is therefore NULLABLE with a specific meaning: null → derive it
// from the feed (what `lab` does), a number → the collector reported it (what
// Gmail and Slack will do). The read path is COALESCE over the two.
export const notificationSources = sqliteTable(
  "notification_sources",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    source: text("source").notNull(),
    label: text("label").notNull(),
    unreadCount: integer("unread_count"), // null → derive from the feed
    lastEventAt: integer("last_event_at"),
    lastSyncAt: integer("last_sync_at"),
    state: text("state").notNull().default("ok"), // 'ok' | 'stale' | 'error'
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.source] })],
);

// ─── Homelab telemetry (../integrations/homelab-telemetry.md) ────────────────
//
// One row per push-capable agent. The token is the agent's whole identity, and
// it belongs to the STACK, not the machine (D3): the same token keeps working
// after the homelab moves to Linux, so a host change is not a re-registration.
//
// Only the SHA-256 hash is stored, and it carries the unique index — so
// verifying a presented token is "hash it, look it up", and no secret is ever
// compared byte-by-byte in app code. Rotation overwrites the hash in place;
// revocation is a row delete. Both are first-class operations, not schema edits.
export const labSources = sqliteTable(
  "lab_sources",
  {
    id: text("id").primaryKey(), // UUID v7
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(), // SHA-256 hex of the bearer token
    createdAt: integer("created_at").notNull(),
    rotatedAt: integer("rotated_at"),
    // The dead-man's switch. Everything the card says about freshness is
    // computed server-side from this column (risk 6) — silence looking like
    // health is the exact failure this integration exists to fix.
    lastSeenAt: integer("last_seen_at"),
    agentVersion: text("agent_version"),
  },
  (table) => [unique("lab_sources_token_hash_idx").on(table.tokenHash)],
);

// LATEST ONLY — the primary key is the source, so every push is a single-row
// upsert rather than an append (risk 3). At a 60s cadence an append would be
// 1,440 rows/day/source of history nobody has asked for; there is no snapshot
// history table until the card actually wants sparklines.
//
// `sections` is the payload's section map stored verbatim as JSON. It is not
// normalised into columns because the producer is deliberately dumb (D6): it
// pushes full monitor detail and the CONSUMER decides what to display, so the
// shape evolves on the read side without a migration on the write side.
export const labSnapshots = sqliteTable("lab_snapshots", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => labSources.id),
  version: integer("version").notNull(),
  capturedAt: integer("captured_at").notNull(), // when the agent measured
  receivedAt: integer("received_at").notNull(), // when we accepted it
  sections: text("sections").notNull(), // JSON — see LabSnapshotPayload
  agentVersion: text("agent_version"),
});
