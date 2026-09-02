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

/** Coarse queue category for filtering match history by queue tab. */
export type MatchQueue = "solo" | "flex" | "aram" | "normal" | "other";

export interface MatchSummary {
  matchId: string;
  champion: string;
  position: string;
  /** Queue category derived from the Riot queueId (drives the queue tabs). */
  queue: MatchQueue;
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

/** Live game, when the player is currently in a match (spectator-v5). */
export interface LiveGame {
  /** Estimated game start (now − elapsed) so the client can tick the timer. */
  startedAt: EpochMs;
  queue: MatchQueue;
  championId: number;
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
  /** Present when the player is currently in a game, else null. */
  live: LiveGame | null;
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

/** Video-call providers we recognise well enough to name and badge. */
export type ConferenceProvider = "meet" | "zoom" | "teams" | "other";

/**
 * A joinable video call attached to an event.
 *
 * Normalised on the API side rather than in the browser, because the raw shape
 * varies by how the invite was made: Google populates `conferenceData` only when
 * the organiser used a calendar add-on, older Meet events carry a bare
 * `hangoutLink`, and a Zoom invite pasted by a human is plain text in the
 * description or the location field. The card should not have to know that.
 */
export interface EventConference {
  provider: ConferenceProvider;
  /** The join URL. */
  url: string;
  /** Human label for the button, e.g. "Join Zoom Meeting". */
  label: string;
  meetingCode?: string;
  passcode?: string;
}

/** How you get to an event, and therefore when you have to leave. */
export type TravelMode = "walk" | "drive";

/**
 * A routed estimate for the leg that ends at this event.
 *
 * Absent whenever we could not honestly produce one — no ORS key, an
 * unresolvable location, or no known origin — rather than guessed at, since a
 * wrong departure time is worse than none.
 */
export interface EventTravel {
  mode: TravelMode;
  /** Routed duration for `mode`, in minutes. */
  minutes: number;
  /** Straight-line distance in km — what chose `mode` (the 2 km rule). */
  km: number;
  /** When to walk out: start − travel − prep. */
  leaveBy: EpochMs;
  /**
   * Where the leg starts. Null means home, which is the first trip of the day;
   * otherwise the previous event's location, so the copy can name it.
   */
  originLabel: string | null;
  /**
   * Slack in minutes between the previous event ending and `leaveBy`. Negative
   * means the trip cannot be made in time. Null when nothing precedes it.
   */
  bufferMinutes: number | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: EpochMs;
  end: EpochMs;
  allDay: boolean;
  location: string | null;
  /** Present when the event has a joinable video call. */
  conference?: EventConference;
  /** Plain text — Google's HTML description, stripped and truncated. */
  description?: string;
  /** Google Calendar web link for this event. */
  htmlLink?: string;
  attendeeCount?: number;
  /** Google Maps Embed URL; absent when unmappable or no key is configured. */
  mapEmbedUrl?: string;
  /** Keyless maps.google.com link; absent when the location is not a place. */
  mapLinkUrl?: string;
  travel?: EventTravel;
}

/** One named contributor to today's stress score, for the dialog's chip rack. */
export interface StressFactor {
  label: string;
  tone: "neutral" | "warn" | "bad";
}

export interface CalendarData {
  connected: true;
  events: CalendarEvent[];
  /**
   * Duration-based busyness for today, 0–100 (Phase 1).
   *
   * Deliberately unchanged by the travel work: this field is documented in
   * CLAUDE.md as duration-based with Workers AI as the Phase 2 upgrade, and is
   * mirrored into ../integrations/homelab-telemetry.md, so redefining it would
   * change a number two repos already agree on. `todayStress` is the wider
   * signal; this stays the density term inside it.
   */
  todayBusyness: number;
  /**
   * 0–100. How much of a rush today is, rather than how full it is.
   *
   * `todayBusyness` is the floor: transition pressure and committed span spend
   * the headroom between it and 100, so this is never below it and the two are
   * equal exactly when nothing is pressing. That ordering is load-bearing — the
   * Today gauge renders this and marks busyness with a notch, so a fill behind
   * the notch would read as travel having made the day calmer.
   */
  todayStress: number;
  /** What drove the score, in descending significance. */
  stressFactors: StressFactor[];
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
  clockZones: string[] | null; // IANA names for the world-clock card
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

// ─── Dashboard layout ────────────────────────────────────────────────────────
// Which cards appear on the dashboard, per user. See docs/ui-suite.md.

/**
 * The dashboard's cards, by key. Deliberately NOT the same set as `Pillar`
 * above: that one is data-pillar-shaped (fitness/nutrition/sleep are separate
 * data sources), whereas these are the tiles actually rendered on the grid.
 * `health` is one card over three pillars; `summary` and `insights` are cards
 * with no pillar of their own. Keep the two unions separate.
 *
 * These keys double as the CSS accent hook — `pillar-<key>` in styles.css sets
 * `--card-accent` — so the union codifies something that already existed.
 */
export type CardKey =
  | "weather"
  | "summary"
  | "perf"
  | "calendar"
  | "tasks"
  | "health"
  | "gaming"
  | "insights"
  | "news"
  | "lab"
  | "notifications"
  | "clock"
  | "timer"
  | "github";

/**
 * Every card key, in the dashboard's fixed render order.
 *
 * **New keys go on the END, and that is load-bearing.** Storage records the
 * exceptions (D4), and `resolveCardOrder()` places anything a stored order has
 * never heard of *after* the keys it knows — in this array's order. So a card
 * appended here appears for every existing user, at 1x1, at the end of their
 * arrangement, with no backfill. Inserting one in the middle would instead
 * silently reorder every user's dashboard.
 */
export const CARD_KEYS: readonly CardKey[] = [
  "weather",
  "summary",
  "perf",
  "calendar",
  "tasks",
  "health",
  "gaming",
  "insights",
  "news",
  "lab",
  "notifications",
  "clock",
  "timer",
  "github",
] as const;

/**
 * Cards that new users should not see by default. When `readLayout()` finds
 * zero stored rows, it seeds hidden rows for these keys so the starter set
 * is the original 9-card wall — not every card ever shipped.
 */
export const DEFAULT_HIDDEN_KEYS: readonly CardKey[] = ["lab", "notifications", "clock", "timer", "github"] as const;

/** Runtime guard — the single place an unknown key is rejected. */
export function isCardKey(value: unknown): value is CardKey {
  return typeof value === "string" && (CARD_KEYS as readonly string[]).includes(value);
}

/**
 * A user's dashboard layout. Stores the *exceptions* (D4): `hidden` lists the
 * cards the user has turned off, so a card shipped after the row was written is
 * visible by default and needs no backfill.
 *
 * `visible` is derived server-side (`CARD_KEYS` minus `hidden`, order
 * preserved) so the client never has to reimplement that subtraction.
 */
export interface DashboardLayout {
  hidden: CardKey[];
  /** The user's preferred order, fully resolved — every key, no gaps. */
  order: CardKey[];
  /** `order` minus `hidden`. Derived server-side so the client never re-derives it. */
  visible: CardKey[];
  /** Sparse: only cards resized away from `1x1`. Absent → `1x1` (D4). */
  sizes: CardSizes;
}

/**
 * Resolve a stored partial order into a total one.
 *
 * Keys present in `stored` keep their relative order; anything missing — a card
 * that shipped after the row was written — falls in afterwards in registry
 * order. That is the ordering half of "store the exceptions" (docs/ui-suite.md
 * D4): a new card needs no backfill, it just lands at the end.
 *
 * Shared rather than duplicated because the server persists it and the client
 * predicts it optimistically; two implementations would drift.
 */
export function resolveCardOrder(stored: readonly CardKey[]): CardKey[] {
  const seen = new Set<CardKey>();
  const ordered: CardKey[] = [];
  for (const key of stored) {
    if (isCardKey(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  for (const key of CARD_KEYS) if (!seen.has(key)) ordered.push(key);
  return ordered;
}

// ─── Card sizing (spans) ─────────────────────────────────────────────────────
// docs/ui-suite.md Phase 4. Cards are whole numbers of identical tiles on a
// unit grid (D1), so a size is just a `WxH` span of the default cell.

/**
 * The sizes a card may take, as `<width>x<height>` in grid cells.
 *
 * A closed set on purpose (D1): the dashboard is a wall of uniform widgets, and
 * free-form spans buy the ability to make it ragged. Every member fits the 4×3
 * ceiling, and the two extremes are there because they are the shapes a
 * 3-column reference grid cannot otherwise express: `3x1` is a full-width
 * banner, and `1x3` a full-height column (D14).
 */
export type CardSize = "1x1" | "2x1" | "1x2" | "2x2" | "3x1" | "1x3";

// Appended rather than slotted in beside `1x2`: this array *is* the order the
// size picker draws, and re-sorting it would move every option a user already
// knows the position of for the sake of a tidier list.
export const CARD_SIZES: readonly CardSize[] = [
  "1x1",
  "2x1",
  "1x2",
  "2x2",
  "3x1",
  "1x3",
] as const;

/** The size a card gets when it is absent from the stored map (D4). */
export const DEFAULT_CARD_SIZE: CardSize = "1x1";

export function isCardSize(value: unknown): value is CardSize {
  return typeof value === "string" && (CARD_SIZES as readonly string[]).includes(value);
}

/** Sparse map of the *exceptions* — cards not at `1x1`. */
export type CardSizes = Partial<Record<CardKey, CardSize>>;

/** A size expanded into grid cells. */
export interface CardSpan {
  w: number;
  h: number;
}

const CARD_SIZE_SPANS: Record<CardSize, CardSpan> = {
  "1x1": { w: 1, h: 1 },
  "2x1": { w: 2, h: 1 },
  "1x2": { w: 1, h: 2 },
  "2x2": { w: 2, h: 2 },
  "3x1": { w: 3, h: 1 },
  "1x3": { w: 1, h: 3 },
};

/** Cells a size occupies. The union is closed, so this never has to guess. */
export function cardSpan(size: CardSize | undefined): CardSpan {
  return CARD_SIZE_SPANS[size ?? DEFAULT_CARD_SIZE];
}

/** The spans of a card list, in render order — the packer's only input. */
export function cardSpans(keys: readonly CardKey[], sizes: CardSizes): CardSpan[] {
  return keys.map((key) => cardSpan(sizes[key]));
}

// ─── Grid derivation ─────────────────────────────────────────────────────────

/** The reference wall: three across, three down, one card per cell. */
const REFERENCE_COLS = 3;

/** Past twelve cells the tiles are too narrow to read across a room (D2). */
export const MAX_GRID_COLS = 4;

/** Rows never exceed three, so a tile is never shorter than on the full wall (D2). */
export const MAX_GRID_ROWS = 3;

/** Hard stop for the packer — far above any shape the size set can produce. */
const PACK_ROW_CEILING = 64;

export interface GridShape {
  cols: number;
  rows: number;
  /** Cells the cards actually occupy. */
  cells: number;
  /** Cells the derived shape offers — `cols * rows`. */
  capacity: number;
  /** True when the cards could not be packed into `MAX_GRID_ROWS` rows. */
  overflows: boolean;
}

/**
 * Rows needed to lay `spans` out in `cols` columns, as CSS grid would.
 *
 * Mirrors `grid-auto-flow: row` *without* `dense`: the cursor only ever moves
 * forward, so a card that will not fit in the rest of its row starts a new one
 * and leaves a hole rather than a later card being pulled back to fill it. That
 * is deliberate — see D9. Returns `null` if a card is wider than the grid.
 */
function packRows(spans: readonly CardSpan[], cols: number): number | null {
  if (spans.some((span) => span.w > cols)) return null;

  const occupied = new Set<string>();
  const taken = (row: number, col: number, span: CardSpan): boolean => {
    for (let r = 0; r < span.h; r++) {
      for (let c = 0; c < span.w; c++) {
        if (occupied.has(`${row + r},${col + c}`)) return true;
      }
    }
    return false;
  };

  let row = 0;
  let col = 0;
  let rows = 0;

  for (const span of spans) {
    while (row < PACK_ROW_CEILING) {
      if (col + span.w > cols) {
        row++;
        col = 0;
        continue;
      }
      if (!taken(row, col, span)) break;
      col++;
    }
    if (row >= PACK_ROW_CEILING) return null;

    for (let r = 0; r < span.h; r++) {
      for (let c = 0; c < span.w; c++) occupied.add(`${row + r},${col + c}`);
    }
    rows = Math.max(rows, row + span.h);
    col += span.w;
  }

  return rows;
}

/**
 * The grid shape for a list of card spans (D2, extended for sizing).
 *
 * **Rows first, then columns.** Rows grow only once each row is full, so the
 * grid fills across before it fills down — the viewport is a widescreen, and
 * deriving columns first made three cards a 1×3, giving every card the full
 * window width at a third of its height (roughly 6:1 against the ~2:1 tile the
 * cards are designed for). With every card 1×1 this reproduces D2's table
 * exactly; spans only ever widen the starting guess.
 *
 * From that guess it *packs* rather than counting cells, because holes are
 * real: a 2-wide card at the end of a row pushes to the next one and leaves the
 * remainder of its row empty. Columns are added until the cards fit in three
 * rows.
 *
 * **It always returns a renderable shape.** If nothing fits in three rows the
 * widest grid is returned with `overflows: true` — a visibly too-tall wall the
 * user can see and fix, never a gesture that refuses to complete. Only the size
 * picker (and the PATCH behind it) treats `overflows` as a hard no; hiding and
 * reordering are allowed to produce it, because the alternative is a dead end
 * where a card cannot be restored without first shrinking another.
 */
export function gridShape(spans: readonly CardSpan[]): GridShape {
  if (spans.length === 0) return { cols: 1, rows: 1, cells: 0, capacity: 1, overflows: false };

  const cells = spans.reduce((total, span) => total + span.w * span.h, 0);
  const widest = Math.max(...spans.map((span) => span.w));
  const tallest = Math.max(...spans.map((span) => span.h));

  const preferredRows = Math.max(
    tallest,
    Math.min(MAX_GRID_ROWS, Math.ceil(cells / REFERENCE_COLS)),
  );
  const startCols = Math.max(widest, Math.min(MAX_GRID_COLS, Math.ceil(cells / preferredRows)));

  let fallback: GridShape | null = null;
  for (let cols = startCols; cols <= MAX_GRID_COLS; cols++) {
    const rows = packRows(spans, cols);
    if (rows === null) continue;
    const shape: GridShape = {
      cols,
      rows,
      cells,
      capacity: cols * rows,
      overflows: rows > MAX_GRID_ROWS,
    };
    if (!shape.overflows) return shape;
    // Keep the widest attempt: more columns can only ever need fewer rows.
    fallback = shape;
  }

  return (
    fallback ?? {
      cols: MAX_GRID_COLS,
      rows: MAX_GRID_ROWS,
      cells,
      capacity: MAX_GRID_COLS * MAX_GRID_ROWS,
      overflows: true,
    }
  );
}

/**
 * Does this set of visible cards fit the wall? The cell budget of D5, expressed
 * as a packing question rather than a sum, because `sum(w × h) <= cols × rows`
 * is not sufficient on its own — it ignores the holes packing leaves behind.
 *
 * Shared by the client's size picker and the server's PATCH validation, so a
 * disabled option and a rejected write can never disagree.
 */
export function fitsGrid(keys: readonly CardKey[], sizes: CardSizes): boolean {
  return !gridShape(cardSpans(keys, sizes)).overflows;
}

/**
 * Drop `1x1` entries so storage only ever holds the exceptions (D4), and
 * discard keys the layout does not know. Applied on the way in *and* on the way
 * out, so what a GET returns is exactly what a PATCH stored.
 */
export function normaliseCardSizes(sizes: CardSizes | undefined): CardSizes {
  const clean: CardSizes = {};
  for (const key of CARD_KEYS) {
    const size = sizes?.[key];
    if (size !== undefined && size !== DEFAULT_CARD_SIZE && isCardSize(size)) clean[key] = size;
  }
  return clean;
}

/**
 * Body for PATCH /dashboard/layout. Both fields are full replacements, not
 * deltas — idempotent, and no add/remove races between two open tabs. Either may
 * be omitted to leave that half untouched.
 */
export interface DashboardLayoutInput {
  hidden?: CardKey[];
  order?: CardKey[];
  sizes?: CardSizes;
}

export interface DashboardLayoutResponse {
  layout: DashboardLayout;
}

// ─── Layout presets ──────────────────────────────────────────────────────────
// docs/ui-suite.md Phase 6. A preset is a whole arrangement under one name —
// which cards, in what order, at what size — applied in a single write.

export type LayoutPresetKey = "wall" | "focus" | "minimal";

/**
 * A named arrangement of the dashboard.
 *
 * **Presets declare `visible`, not `hidden` — the opposite of how a *user's*
 * layout is stored (D4), and deliberately so.** The two need opposite defaults
 * for a card that ships later. A user's row stores the exceptions so a new card
 * appears without a backfill; a preset stores the roster so a new card cannot
 * silently gatecrash an arrangement whose whole point is being small. "Minimal"
 * that grows a card every release is not minimal.
 *
 * The one preset that *should* absorb new cards gets it for free by naming the
 * live constant: `wall` is `CARD_KEYS`, so a tenth card joins it by existing.
 * That is exactly the split the Homelab card needs — it lands on the wall, and
 * stays out of Focus and Minimal until someone puts it there.
 *
 * `visible` doubles as the order: the array *is* the arrangement, front to back.
 * That matters because packing depends on position (D9) — the same cards at the
 * same sizes in a different order can need a fourth row.
 */
/**
 * The part of a preset that *is* the arrangement: which cards, in what order,
 * at what size. Shared by the three built-in presets and by a user's saved ones
 * (Phase 7), so both are applied, matched and audited by the same code paths.
 *
 * `visible` is the ROSTER, not the exceptions — the deliberate inversion of how
 * a user's live layout is stored (D4/D12) — and it doubles as the order.
 */
export interface PresetArrangement {
  visible: readonly CardKey[];
  sizes: CardSizes;
}

export interface LayoutPreset extends PresetArrangement {
  key: LayoutPresetKey;
  label: string;
  /** One line, shown as the control's title. Says what the preset is *for*. */
  description: string;
}

/**
 * The built-in presets.
 *
 * Focus and Minimal are verified to pack with **zero holes** at their derived
 * shape — a curated preset that left the wall ragged would undercut the reason
 * to offer one. `/layout-lab` asserts this at dev time, since the repo has no
 * test runner.
 *
 * **Wall is deliberately exempt from that assertion**, and the reason is the
 * thing that makes Wall useful. Its roster is the live `CARD_KEYS` constant
 * rather than a hand-picked list, so it grows for free whenever a card ships —
 * and a roster it does not control cannot promise an exact multiple of the grid
 * at every future card count. Nine cards packed exactly (3×3); eleven leave one
 * spare cell in a 4×3. The alternatives were both worse: hand-tuning a size
 * exception into Wall every time the registry grows re-introduces the
 * maintenance it exists to avoid, and holding the roster back to keep the sum
 * tidy defeats the point entirely. What Wall promises is *everything, evenly,
 * in no more than three rows* — and that still holds.
 */
export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    key: "wall",
    label: "Wall",
    description: "Everything, evenly. The whole registry on one secondary monitor.",
    // Named, not spelled out: this is the preset that should grow when a card
    // ships — and it has, twice. 9 cards × 1×1 was a 3 × 3, exactly full;
    // 11 is a 4 × 3 with one spare cell. See the exemption note above.
    visible: CARD_KEYS,
    sizes: {},
  },
  {
    key: "focus",
    label: "Focus",
    description: "The working day — what's on, what's due, and the conditions for it.",
    // 4 + 4 + 2 + 2 = 12 cells → 4 × 3, exactly full. Order is load-bearing:
    // the two 2×2s must lead, or the 2×1s wrap into a fourth row (D9).
    visible: ["summary", "calendar", "tasks", "weather"],
    sizes: { summary: "2x2", calendar: "2x2", tasks: "2x1", weather: "2x1" },
  },
  {
    key: "minimal",
    label: "Minimal",
    description: "A glance and nothing else — the day, and the weather it happens in.",
    // 4 + 2 = 6 cells → 3 × 2, exactly full.
    visible: ["summary", "weather"],
    sizes: { summary: "2x2", weather: "1x2" },
  },
] as const;

export function layoutPreset(key: string): LayoutPreset | undefined {
  return LAYOUT_PRESETS.find((preset) => preset.key === key);
}

/**
 * A preset as a PATCH body — the exact three fields the layout endpoint takes.
 *
 * `hidden` is *derived* here rather than stored on the preset, which is what
 * makes the roster-vs-exceptions split above work: subtracting from the live
 * `CARD_KEYS` means a card this preset has never heard of is hidden by default,
 * while `wall` (whose roster *is* `CARD_KEYS`) hides nothing, forever.
 *
 * The order sent is the roster followed by everything else, so a hidden card
 * keeps a defined place to reappear in when it is restored.
 */
export function presetLayoutInput(preset: PresetArrangement): Required<DashboardLayoutInput> {
  const visible = new Set(preset.visible);
  return {
    hidden: CARD_KEYS.filter((key) => !visible.has(key)),
    order: resolveCardOrder(preset.visible),
    sizes: normaliseCardSizes(preset.sizes),
  };
}

/**
 * Which preset the current layout *is*, if any.
 *
 * Without this the control is write-only: three buttons that never indicate
 * which one you are looking at, so the only way to tell is to remember. Only
 * the visible cards are compared — their order and their sizes. A hidden card's
 * position is not observable, so letting it break the match would mean a layout
 * that looks exactly like Minimal refusing to admit that it is.
 */
export function matchingPresetKey(layout: DashboardLayout): LayoutPresetKey | null {
  return LAYOUT_PRESETS.find((preset) => layoutMatchesArrangement(layout, preset))?.key ?? null;
}

/**
 * Is this layout the arrangement described by `roster` + `sizes`?
 *
 * The comparison `matchingPresetKey` is built from, factored out so a *saved*
 * preset (Phase 7) is recognised by exactly the rule a built-in one is. Two
 * separate implementations of "is this the same arrangement" would drift, and
 * the symptom would be a chip that highlights for the built-ins and not for
 * the user's own.
 *
 * Only the visible cards are compared — their order and their sizes. A hidden
 * card's position is not observable, so letting it break the match would mean a
 * layout that looks exactly like Minimal refusing to admit that it is.
 */
export function layoutMatchesArrangement(
  layout: DashboardLayout,
  arrangement: PresetArrangement,
): boolean {
  // A layout is structurally an arrangement plus the parts a preset does not
  // describe, so this is the same comparison with a narrower name.
  return arrangementsMatch(layout, arrangement);
}

/**
 * Are these two arrangements the same wall?
 *
 * Same cards, in the same order, at the same effective sizes. Sizes are sparse
 * (D4), so they are compared through the `1x1` default rather than as objects —
 * `{}` and `{ news: "1x1" }` describe the same wall and must not compare as
 * different.
 *
 * This is what makes "you already have a preset that looks like this" possible
 * to answer, and it is the same rule that decides which chip highlights. The
 * two have to be one function: a duplicate check that disagreed with the
 * highlight would either refuse a save that would have been distinguishable, or
 * allow one that then lights two chips at once.
 */
export function arrangementsMatch(a: PresetArrangement, b: PresetArrangement): boolean {
  if (a.visible.length !== b.visible.length) return false;
  if (!a.visible.every((key, i) => b.visible[i] === key)) return false;
  return a.visible.every(
    (key) => (a.sizes[key] ?? DEFAULT_CARD_SIZE) === (b.sizes[key] ?? DEFAULT_CARD_SIZE),
  );
}

// ─── Saved presets (user-defined) ─────────────────────────────────────
// docs/ui-suite.md Phase 7. The three built-ins above are constants; these are
// arrangements a user saved under a name of their own, and they are the one
// part of this feature that needs storage (`card_presets`, migration 0015).

/**
 * A user's saved arrangement.
 *
 * Structurally a `LayoutPreset` minus its closed `key`: it carries the same
 * `visible` roster and sparse `sizes`, so `presetLayoutInput()`,
 * `layoutMatchesArrangement()` and the `/layout-lab` audit all take it unchanged.
 *
 * It stores the roster rather than the exceptions for the same reason the
 * built-ins do (D12): a card that ships later must not silently gatecrash an
 * arrangement someone deliberately pared down. The difference from a built-in
 * is that nothing here can name the live `CARD_KEYS` constant, so **no saved
 * preset absorbs a new card** — that is what "Wall" is for, and it stays.
 */
export interface SavedPreset extends PresetArrangement {
  id: string;
  name: string;
  visible: CardKey[];
  createdAt: number;
  updatedAt: number;
}

/**
 * How many presets one user may save.
 *
 * A real limit rather than a guard against abuse: the presets live as chips in
 * the edit bar next to the three built-ins, and past roughly this many the bar
 * wraps to a third line and choosing one stops being faster than arranging by
 * hand — which is the entire argument for the feature.
 */
export const SAVED_PRESET_LIMIT = 8;

/** Longest a preset name may be. It has to fit on a chip beside a glyph. */
export const PRESET_NAME_MAX = 24;

/**
 * Clean a user-supplied preset name, or reject it.
 *
 * Trims, collapses internal whitespace, and refuses empty or over-long input.
 * Shared by both sides so the client disables Save on exactly the names the
 * server would refuse, and the uniqueness check compares normalised forms
 * rather than treating "Morning" and "Morning " as two different presets.
 */
export function normalisePresetName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > PRESET_NAME_MAX) return null;
  return name;
}

/**
 * The current layout as a saveable arrangement.
 *
 * Captures `visible` (which is already the order, hidden cards excluded) and
 * the sizes of those cards only — a size left behind on a hidden card is not
 * part of what the user is looking at, and carrying it would make two visually
 * identical layouts save as different presets.
 */
export function layoutArrangement(layout: DashboardLayout): PresetArrangement {
  const visible = [...layout.visible];
  const sizes: CardSizes = {};
  for (const key of visible) {
    const size = layout.sizes[key];
    if (size !== undefined && size !== DEFAULT_CARD_SIZE) sizes[key] = size;
  }
  return { visible, sizes };
}

/**
 * Every saved preset the current layout matches.
 *
 * **This should never return more than one, and the list is not how that is
 * enforced.** `duplicateArrangement()` refuses a save or a re-capture that would
 * produce a second preset describing the same wall, so uniqueness is a property
 * of what can be stored rather than of what is displayed. Two chips lighting at
 * once is the symptom that check has been bypassed.
 *
 * It stays plural anyway, because the storage predates the check by exactly one
 * commit and nothing backfills: a row written before it, or by a client that
 * skipped it, must still highlight rather than be silently dropped from the
 * comparison. Returning a list keeps that case visible instead of picking an
 * arbitrary winner.
 */
export function matchingSavedPresetIds(
  layout: DashboardLayout,
  saved: readonly SavedPreset[],
): string[] {
  return saved.filter((preset) => layoutMatchesArrangement(layout, preset)).map((p) => p.id);
}

/**
 * The preset this arrangement would duplicate, if any.
 *
 * Checks the **built-ins as well as** the user's own, because the failure is
 * the same either way: an arrangement identical to Wall saved as "My Wall"
 * lights two chips, and neither is more correct than the other. Names both
 * kinds so the refusal can say which preset is in the way rather than only that
 * something is.
 *
 * `excludeId` is for re-capturing an existing preset, which must be allowed to
 * match itself — that is what re-capture *is*.
 */
export function duplicateArrangement(
  arrangement: PresetArrangement,
  saved: readonly SavedPreset[],
  options: { excludeId?: string } = {},
): { kind: "builtin" | "saved"; name: string } | null {
  const builtin = LAYOUT_PRESETS.find((preset) => arrangementsMatch(arrangement, preset));
  if (builtin) return { kind: "builtin", name: builtin.label };

  const other = saved.find(
    (preset) => preset.id !== options.excludeId && arrangementsMatch(arrangement, preset),
  );
  return other ? { kind: "saved", name: other.name } : null;
}

/**
 * The cards this arrangement leaves out — every live `CardKey` not in its
 * roster.
 *
 * Exists to make gap 14 sayable in the UI rather than only in this file. A
 * saved preset stores its roster (D12/D13) and nothing backfills it, so a card
 * that ships after the preset was written is absent from it — correct for an
 * arrangement someone deliberately pared down, and a genuine surprise the first
 * time it happens. The chip can only warn about it if it can count it, and it
 * has to be counted against the *live* constant rather than against whatever
 * was current when the row was written, which is not recorded anywhere.
 *
 * `wall` is the escape hatch and answers `[]` forever, because its roster *is*
 * `CARD_KEYS`.
 */
export function arrangementOmits(arrangement: PresetArrangement): CardKey[] {
  const roster = new Set(arrangement.visible);
  return CARD_KEYS.filter((key) => !roster.has(key));
}

/** Body for POST /dashboard/presets — name plus the arrangement to save. */
export interface SavedPresetCreateInput {
  name: string;
  visible: CardKey[];
  sizes?: CardSizes;
}

/**
 * Body for PATCH /dashboard/presets/:id.
 *
 * Both fields are optional and independent: renaming is one gesture, and
 * re-capturing the current arrangement under an existing name ("update this
 * preset to what I am looking at now") is another.
 */
export interface SavedPresetUpdateInput {
  name?: string;
  visible?: CardKey[];
  sizes?: CardSizes;
}

export interface SavedPresetsResponse {
  presets: SavedPreset[];
}

export interface SavedPresetResponse {
  preset: SavedPreset;
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

/** Body for PUT /settings/clock-zones. */
export interface SetClockZonesInput {
  zones: string[];
}

export interface SetClockZonesResponse {
  settings: UserSettings;
}

// ─── GitHub activity ────────────────────────────────────────────────────────

export interface GitHubActivityItem {
  id: string;
  kind: "commit" | "pr" | "review";
  title: string;
  repo: string;
  url: string;
  state?: string; // "open" | "closed" | "merged" for PRs
  ciStatus?: string; // "success" | "failure" | "pending" for PRs
  at: EpochMs;
}

export interface GitHubActivityResponse {
  connected: boolean;
  items: GitHubActivityItem[];
}

// ─── Focus sessions ─────────────────────────────────────────────────────────

export interface FocusSession {
  id: string;
  userId: string;
  startedAt: EpochMs;
  duration: number; // seconds
  completed: boolean;
  createdAt: EpochMs;
}

export interface FocusSessionInput {
  startedAt: EpochMs;
  duration: number;
  completed: boolean;
}

export interface FocusSessionsResponse {
  sessions: FocusSession[];
  todayTotal: number; // total completed seconds today
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

// ─── Homelab telemetry ───────────────────────────────────────────────────────
//
// The wire contract lives in ../integrations/homelab-telemetry.md and is
// normative for BOTH repos — the homelab agent codes against the same field
// names. Anything not declared here is not sent.

/** Payload schema version. Bump when the shape changes incompatibly. */
export const LAB_SCHEMA_VERSION = 1;

/**
 * Why a collector failed, as a closed enum.
 *
 * Never a raw exception string: those leak file paths and hostnames from the
 * lab, which is precisely what the payload allowlist exists to keep out.
 */
export type LabSectionError = "unreachable" | "auth" | "timeout" | "unexpected_shape";

export const LAB_SECTION_ERRORS: readonly LabSectionError[] = [
  "unreachable",
  "auth",
  "timeout",
  "unexpected_shape",
] as const;

export function isLabSectionError(value: unknown): value is LabSectionError {
  return typeof value === "string" && (LAB_SECTION_ERRORS as readonly string[]).includes(value);
}

/**
 * A section of the snapshot — always tagged, **never a bare `null`**.
 *
 * A null section is ambiguous between "nothing to report" and "the collector
 * failed", and that ambiguity is the exact silence-looks-like-health failure
 * this integration exists to fix. The card must be able to say *"Kuma
 * unreachable"* rather than render an empty list that reads as "all clear".
 */
export type LabSectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LabSectionError };

export type LabMonitorStatus = "up" | "down" | "degraded" | "paused";

export interface LabMonitor {
  /** Stable id from the source, for diffing across pushes. NOT the label — a
   *  rename must not read as a new service. */
  key: string;
  /** Display name. Labels only: no hostnames, no LAN or Tailscale addresses. */
  label: string;
  status: LabMonitorStatus;
  /** ISO timestamp of the last state change — what lets the card say "down 14m". */
  since?: string;
  uptime24h?: number;
}

export interface LabMonitors {
  counts: { up: number; down: number; paused: number; degraded?: number };
  items: LabMonitor[];
}

export type LabBackupResult = "ok" | "failed" | "running";

export interface LabBackupPlan {
  key: string;
  label: string;
  lastRunAt?: string;
  result: LabBackupResult;
}

export interface LabBackups {
  plans: LabBackupPlan[];
}

export interface LabImages {
  pendingUpdates: number;
  items: { key: string; label: string }[];
}

export interface LabContainers {
  running: number;
  total: number;
  unhealthy: { key: string; label: string }[];
}

export interface LabSections {
  monitors: LabSectionResult<LabMonitors>;
  backups: LabSectionResult<LabBackups>;
  images: LabSectionResult<LabImages>;
  containers: LabSectionResult<LabContainers>;
}

/** Body of `POST /api/lab/ingest`. */
export interface LabSnapshotPayload {
  version: number;
  /** ISO 8601. When the agent measured, not when we received it. */
  capturedAt: string;
  agent?: { version?: string };
  sections: LabSections;
}

/** One relayed ntfy event. Body of `POST /api/lab/events` is `{version, events}`. */
export interface LabEventInput {
  ntfyId: string;
  topic: string;
  publishedAt: string;
  title: string;
  message?: string;
  priority?: number;
  tags?: string[];
}

export interface LabEventsPayload {
  version: number;
  events: LabEventInput[];
}

/**
 * How stale the lab data is. **Computed server-side, always** (risk 6) — the
 * client never derives freshness, because a stale snapshot rendered as current
 * is the precise failure mode this card exists to prevent.
 */
export type LabFreshness = "fresh" | "stale" | "offline";

/** 3 minutes — 3× the 60s push cadence, so one missed push is not an alarm. */
export const LAB_STALE_AFTER_MS = 3 * 60 * 1000;
/** 15 minutes — also the Phase 3 alerting threshold (D8). */
export const LAB_OFFLINE_AFTER_MS = 15 * 60 * 1000;

export function labFreshness(lastSeenAt: number | null, now: number): LabFreshness {
  // Never heard from at all is not "a bit stale" — it is offline. A source that
  // has never pushed and one that stopped pushing are the same thing to a user.
  if (lastSeenAt === null) return "offline";
  const age = now - lastSeenAt;
  if (age >= LAB_OFFLINE_AFTER_MS) return "offline";
  if (age >= LAB_STALE_AFTER_MS) return "stale";
  return "fresh";
}

/** `GET /api/lab`. `source` is null when this user has no lab connected. */
export interface LabResponse {
  source: {
    id: string;
    label: string;
    lastSeenAt: number | null;
    freshness: LabFreshness;
    agentVersion: string | null;
  } | null;
  snapshot: {
    version: number;
    capturedAt: number;
    receivedAt: number;
    sections: LabSections;
  } | null;
  /** Recent lab notifications, for the card's green-state filler. */
  events: Notification[];
}

/** Response of `POST /api/lab/sources` and `…/rotate`. The token is shown ONCE. */
export interface LabSourceSecret {
  id: string;
  label: string;
  /** Plaintext bearer token. Never stored, never returned again. */
  token: string;
}

// ─── Notifications spine (docs/notifications.md) ─────────────────────────────

/**
 * Where a notification came from.
 *
 * A string union for the sources that exist, but the API and schema treat it as
 * free TEXT — adding Gmail is a collector, not a migration, and an unknown
 * source arriving from storage must render rather than crash.
 */
export type NotificationSourceKey = "lab" | "gmail" | "slack" | (string & {});

export type NotificationStatus = "unread" | "read" | "dismissed";

export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = [
  "unread",
  "read",
  "dismissed",
] as const;

export function isNotificationStatus(value: unknown): value is NotificationStatus {
  return (
    typeof value === "string" && (NOTIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

export interface Notification {
  id: string;
  source: NotificationSourceKey;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  /** ntfy's 1–5 scale; 3 is normal. */
  priority: number;
  tags: string[];
  publishedAt: number;
  status: NotificationStatus;
}

/**
 * One badge on the card's top row.
 *
 * `unread` is already resolved: for a feed source it is a count of rows, for a
 * count-only source (Gmail, Slack) it is what the collector reported. The card
 * renders one number and does not need to know which kind it is looking at.
 */
export interface NotificationSourceSummary {
  source: NotificationSourceKey;
  label: string;
  unread: number;
  lastEventAt: number | null;
  state: "ok" | "stale" | "error";
}

export interface NotificationsResponse {
  sources: NotificationSourceSummary[];
  /** Unread feed rows, newest first, capped server-side. */
  items: Notification[];
  /** Total unread across every source — the number Zero Inbox drives to zero. */
  totalUnread: number;
}
