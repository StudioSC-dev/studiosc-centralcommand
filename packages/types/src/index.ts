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
  createdAt: EpochMs;
  completedAt: EpochMs | null;
}

export interface TaskCreateInput {
  title: string;
  priority?: TaskPriority;
}

/** Partial update — toggle status, re-prioritize, rename, reorder. */
export interface TaskUpdateInput {
  title?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  position?: number;
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

/** Returned when the user hasn't connected their Google account yet. */
export interface CalendarNotConnected {
  connected: false;
}

export type CalendarResponse = CalendarData | CalendarNotConnected;

// ─── Weather ─────────────────────────────────────────────────────────────────

export type WeatherUnits = "metric" | "imperial";

export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
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
  forecast: WeatherForecastEntry[];
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
  createdAt: EpochMs;
  updatedAt: EpochMs;
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
}
export interface SleepLogEntry extends SleepLogInput {
  id: string;
  loggedAt: EpochMs;
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

export interface PerformanceToday {
  date: string;
  score: number;
  breakdown: PerformanceBreakdown;
  /** Whether any sleep/nutrition was logged for the day. */
  hasData: boolean;
}

export interface PerformanceHistoryPoint {
  date: string;
  score: number;
}

export interface PerformanceData {
  today: PerformanceToday;
  history: PerformanceHistoryPoint[];
}

export type PerformanceResponse = PerformanceData;
