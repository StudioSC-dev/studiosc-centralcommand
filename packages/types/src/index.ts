/**
 * Shared TypeScript interfaces for Central Command.
 *
 * These are the contract between the API (`apps/api`) and the web client
 * (`apps/web`). Every entity is multi-user by design — anything user-scoped
 * carries a `userId`.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

/** UUID v7 — canonical, time-sortable user identifier. */
export type UserId = string;

/** Epoch milliseconds. D1 stores timestamps as INTEGER. */
export type EpochMs = number;

/** The pillars surfaced on the dashboard. */
export type Pillar =
  | "calendar"
  | "weather"
  | "fitness"
  | "nutrition"
  | "sleep"
  | "gaming"
  | "news"
  | "performance";

// ─── Summary (cross-pillar overview) ─────────────────────────────────────────
// Every field is nullable: the summary is a cheap read of already-available
// data (DB + KV caches) and never triggers fresh external fetches.

export interface SummaryData {
  performance: { score: number; hasData: boolean } | null;
  weather: { temp: number; units: WeatherUnits; description: string } | null;
  calendar: { nextEventTitle: string; nextEventStart: EpochMs; todayBusyness: number } | null;
  sleep: { durationMin: number } | null;
  nutrition: { calories: number } | null;
  fitness: { sessions: number; durationMin: number } | null;
  gaming: { rank: string; winRate7d: number | null } | null;
  news: { title: string; source: string } | null;
}

export type SummaryResponse = SummaryData;

// ─── API envelope ────────────────────────────────────────────────────────────

/** Standard success envelope returned by every API route. */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** Standard error envelope returned by every API route. */
export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthProviderKind = "google" | "microsoft" | "local";

export interface User {
  id: UserId;
  email: string;
  createdAt: EpochMs;
}

// ─── Profile ───────────────────────────────────────────────────────────────────

export type Sex = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface UserProfile {
  userId: UserId;
  displayName: string | null;
  birthdate: string | null; // YYYY-MM-DD
  sex: Sex | null;
  /** Optional body metrics — edited on the profile page, not at onboarding. */
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  /** Saved League/Riot identity — drives auto-connect of the gaming pillar. */
  riotId: string | null; // "gameName#tagLine"
  riotRegion: string | null; // platform id, e.g. "sg2"
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/** Body for PUT /profile. Onboarding sends the first three; profile page can send all. */
export interface ProfileInput {
  displayName?: string;
  birthdate?: string | null;
  sex?: Sex | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  riotId?: string | null;
  riotRegion?: string | null;
}

export interface ProfileResponse {
  profile: UserProfile | null;
}

/** Current identity, from GET /api/auth/me. */
export interface MeResponse {
  id: UserId;
  email: string;
  demo: boolean;
  /** True once displayName + birthdate + sex are set (onboarding done). */
  profileComplete: boolean;
}

// ─── Gaming ──────────────────────────────────────────────────────────────────

export type GamingProvider = "riot" | "steam";
export type Game = "league" | "valorant" | "dota2" | "cs2";

export type RiotRole = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export interface GamingConnectInput {
  riotId: string; // "gameName#tagLine"
  region: string; // platform id, e.g. "sg2"
}

export interface RankInfo {
  queueType: "solo" | "flex";
  tier: string; // e.g. "GOLD"
  division: string; // I–IV
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchSummary {
  matchId: string;
  champion: string;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  /** Role-normalized, non-authoritative score, 0–100. */
  score: number;
  playedAt: EpochMs;
}

export interface GamingData {
  connected: true;
  riotId: string;
  region: string;
  ranks: RankInfo[];
  matches: MatchSummary[];
  /** Win rate over the rolling window, 0–1, or null if no games. */
  winRate7d: number | null;
  winRate30d: number | null;
}

export interface GamingNotConnected {
  connected: false;
}

export type GamingResponse = GamingData | GamingNotConnected;

// ─── News ────────────────────────────────────────────────────────────────────

export type NewsTopic = "basketball" | "tech" | "league";

export interface NewsItem {
  id: string;
  source: string;
  topic: NewsTopic;
  title: string;
  url: string;
  /** Lead image from the feed (enclosure/media/inline). Null when none. */
  image: string | null;
  publishedAt: EpochMs;
}

export interface NewsData {
  items: NewsItem[];
}

export type NewsResponse = NewsData;

// ─── Tasks (current priorities) ──────────────────────────────────────────────

export type TaskPriority = "high" | "med" | "low";
export type TaskStatus = "open" | "done";
/** Where a task originates. Phase 2 adds external sources. */
export type TaskSource = "native" | "linear" | "jira" | "trello";

export interface Task {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  position: number;
  source: TaskSource;
  /** Optional due date (epoch ms). Importance = priority, urgency = deadline. */
  deadline: EpochMs | null;
  createdAt: EpochMs;
  completedAt: EpochMs | null;
}

export interface TaskCreateInput {
  title: string;
  priority?: TaskPriority;
  deadline?: EpochMs | null;
}

/** Partial update — toggle status, re-prioritize, rename, reorder, (re)schedule. */
export interface TaskUpdateInput {
  title?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  position?: number;
  deadline?: EpochMs | null;
}

export interface TasksData {
  tasks: Task[];
}

export type TasksResponse = TasksData;

// ─── Insights (rule-based; LLM narrative is Phase 2) ─────────────────────────

export type InsightTone = "good" | "bad" | "neutral";

export interface Insight {
  id: string;
  title: string; // short headline
  detail: string; // one-line explanation
  tone: InsightTone;
}

export interface InsightsData {
  insights: Insight[];
}

export type InsightsResponse = InsightsData;

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: EpochMs;
  end: EpochMs;
  allDay: boolean;
  location: string | null;
}

export interface CalendarData {
  connected: true;
  events: CalendarEvent[];
  /** Duration-based busyness for today, 0–100 (Phase 1). */
  todayBusyness: number;
}

/** Returned when no usable Google connection exists for the user. */
export interface CalendarNotConnected {
  connected: false;
  /**
   * True when a connection previously existed but its credentials expired or
   * were revoked, so the user must re-consent. Distinguishes a reconnect
   * prompt from a first-time connect.
   */
  needsReconnect?: boolean;
}

export type CalendarResponse = CalendarData | CalendarNotConnected;

// ─── Weather ─────────────────────────────────────────────────────────────────

export type WeatherUnits = "metric" | "imperial";

export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  /** Wind direction in meteorological degrees (0 = N, 90 = E). */
  windDeg: number;
  /** Gust speed in the same units as windSpeed. Null when not reported. */
  windGust: number | null;
  /** Sea-level atmospheric pressure, hPa. */
  pressure: number;
  /** Cloud cover, %. */
  clouds: number;
  /** Visibility in metres (OWM caps at 10000). */
  visibility: number;
  /** Sunrise / sunset for the location's day (epoch ms). */
  sunrise: EpochMs;
  sunset: EpochMs;
  /** Seconds offset from UTC for the location, for formatting sunrise/sunset locally. */
  timezoneOffsetSec: number;
  /** Rainfall in the last hour, mm. Null when it isn't raining. */
  rain1h: number | null;
  description: string;
  icon: string;
  observedAt: EpochMs;
}

export interface WeatherForecastEntry {
  at: EpochMs;
  temp: number;
  /** Probability of precipitation for the slot, 0–1. */
  pop: number;
  description: string;
  icon: string;
}

/** One day of the multi-day outlook, aggregated from the 3-hour forecast slots. */
export interface WeatherDailyEntry {
  date: string; // YYYY-MM-DD in the location's local day
  min: number;
  max: number;
  /** Highest precip probability across the day's slots, 0–1. */
  pop: number;
  icon: string;
}

/** Combined forecast payload — hourly strip (next 24h) + multi-day outlook. */
export interface WeatherForecast {
  hourly: WeatherForecastEntry[];
  daily: WeatherDailyEntry[];
}

/** A geocoded place, from OWM's free Geocoding API (city search / reverse). */
export interface GeoCity {
  name: string;
  state: string | null;
  country: string; // ISO 3166 country code, e.g. "PH"
  lat: number;
  lon: number;
}

export interface CitySearchResponse {
  results: GeoCity[];
}

export interface ReverseGeocodeResponse {
  result: GeoCity | null;
}

export interface WeatherData {
  location: { lat: number; lon: number; label: string | null };
  units: WeatherUnits;
  current: WeatherCurrent;
  /** Hourly strip for the next 24h. */
  forecast: WeatherForecastEntry[];
  /** Multi-day outlook (today + up to 4 more days). */
  daily: WeatherDailyEntry[];
}

/** Returned when the user hasn't set a home location yet (sign-up incomplete). */
export interface WeatherNeedsLocation {
  location: null;
}

export type WeatherResponse = WeatherData | WeatherNeedsLocation;

// ─── User settings (location + timezone) ─────────────────────────────────────

export interface UserSettings {
  userId: UserId;
  timezone: string | null; // IANA name, e.g. "Asia/Singapore"
  homeLat: number | null;
  homeLon: number | null;
  locationLabel: string | null; // human-readable, e.g. "Singapore"
  units: WeatherUnits | null; // weather display preference (null → metric)
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/** Body for PUT /settings/units. */
export interface SetUnitsInput {
  units: WeatherUnits;
}

/** Best-effort defaults from the Cloudflare edge (pre-fills the location form). */
export interface GeoDefaults {
  timezone: string | null;
  homeLat: number | null;
  homeLon: number | null;
  locationLabel: string | null;
}

export interface SettingsResponse {
  settings: UserSettings | null;
  geoDefaults: GeoDefaults;
}

/** Body for PUT /settings/location. All fields optional/nullable. */
export interface LocationInput {
  timezone?: string | null;
  homeLat?: number | null;
  homeLon?: number | null;
  locationLabel?: string | null;
}

export interface SetLocationResponse {
  settings: UserSettings;
}

// ─── Manual logs (fitness / nutrition / sleep) ───────────────────────────────

export interface FitnessLogInput {
  activity: string;
  durationMin: number;
  intensity?: number; // 1–5
}
export interface FitnessLogEntry extends FitnessLogInput {
  id: string;
  loggedAt: EpochMs;
}

export interface NutritionLogInput {
  meal?: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}
export interface NutritionLogEntry extends NutritionLogInput {
  id: string;
  loggedAt: EpochMs;
}

export interface SleepLogInput {
  date?: string; // YYYY-MM-DD
  durationMin: number;
  quality?: number; // 1–5
  hrv?: number | null; // overnight/morning HRV (ms); stored + displayed, not yet scored
  restingHr?: number | null; // overnight/morning resting heart rate (bpm)
}
export interface SleepLogEntry extends SleepLogInput {
  id: string;
  loggedAt: EpochMs;
}

/* Partial edits to an existing log entry. Optional fields accept null to clear
   them; required fields (activity, calories, durationMin) are only changed when a
   valid value is supplied. */
export interface FitnessLogUpdate {
  activity?: string;
  durationMin?: number;
  intensity?: number | null;
}
export interface NutritionLogUpdate {
  meal?: string | null;
  calories?: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}
export interface SleepLogUpdate {
  date?: string;
  durationMin?: number;
  quality?: number | null;
  hrv?: number | null;
  restingHr?: number | null;
}

/** GET response for each log pillar. */
export interface LogList<T> {
  entries: T[];
}

// ─── Performance ─────────────────────────────────────────────────────────────

/** Inputs to the daily performance score. All sub-scores normalize to 0–100. */
export interface PerformanceInputs {
  /** Sleep sub-score, 0–100. */
  sleep: number;
  /** Nutrition sub-score, 0–100. */
  nutrition: number;
  /** HRV sub-score, 0–100. Optional — defaults to a neutral 50. */
  hrv?: number;
}

export interface PerformanceBreakdown {
  sleep: number;
  nutrition: number;
  hrv: number;
}

/**
 * HRV readiness info. Captured + displayed in Phase 1 but NOT yet folded into
 * the score (`scored: false`) — HRV is too individual to score from a thin
 * baseline. `breakdown.hrv` therefore stays neutral; this block drives the UI's
 * "building baseline" note.
 */
export interface PerformanceHrv {
  latestMs: number | null; // most recent reading for the day
  nights: number; // count of HRV-logged nights so far (baseline progress)
  scored: false;
}

export interface PerformanceToday {
  date: string;
  score: number;
  breakdown: PerformanceBreakdown;
  hrv: PerformanceHrv;
  /** Whether any sleep/nutrition was logged for the day. */
  hasData: boolean;
}

export interface PerformanceHistoryPoint {
  date: string;
  score: number;
}

/**
 * Resting-heart-rate summary (bpm), captured alongside sleep. Distinct from HRV.
 * `avg7d`/`avg30d` drive the weekly stat + trend; null when no readings yet.
 */
export interface PerformanceRestingHr {
  latest: number | null;
  avg7d: number | null;
  avg30d: number | null;
}

export interface PerformanceData {
  today: PerformanceToday;
  /** Daily scores, ascending. Up to ~30 points; the card toggles 7d/30d. */
  history: PerformanceHistoryPoint[];
  restingHr: PerformanceRestingHr;
}

export type PerformanceResponse = PerformanceData;
