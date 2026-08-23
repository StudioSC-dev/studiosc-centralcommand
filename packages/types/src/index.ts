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
  | "news";

/** Every card key, in the dashboard's fixed render order. */
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
] as const;

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
 * free-form spans buy the ability to make it ragged. Everything here fits the
 * 4×3 ceiling with room to spare, and `3x1` is the widest because a full-width
 * banner is the only shape a 3-column reference grid cannot otherwise express.
 */
export type CardSize = "1x1" | "2x1" | "1x2" | "2x2" | "3x1";

export const CARD_SIZES: readonly CardSize[] = ["1x1", "2x1", "1x2", "2x2", "3x1"] as const;

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
export interface LayoutPreset {
  key: LayoutPresetKey;
  label: string;
  /** One line, shown as the control's title. Says what the preset is *for*. */
  description: string;
  /** The roster, in render order. Everything else is hidden. */
  visible: readonly CardKey[];
  /** Sizes for the visible cards. Sparse — absent means `1x1` (D4). */
  sizes: CardSizes;
}

/**
 * The built-in presets.
 *
 * All three are verified to pack with **zero holes** at their derived shape —
 * a preset that left the wall ragged would undercut the reason to offer one.
 * `/layout-lab` asserts this at dev time, since the repo has no test runner.
 */
export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    key: "wall",
    label: "Wall",
    description: "Everything, evenly. The full 3 × 3 secondary-monitor view.",
    // Named, not spelled out: this is the preset that should grow when a card
    // ships. 9 cards × 1×1 → 3 × 3, exactly full.
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
export function presetLayoutInput(preset: LayoutPreset): Required<DashboardLayoutInput> {
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
  const sizesMatch = (visible: readonly CardKey[], a: CardSizes, b: CardSizes): boolean =>
    visible.every((key) => (a[key] ?? DEFAULT_CARD_SIZE) === (b[key] ?? DEFAULT_CARD_SIZE));

  for (const preset of LAYOUT_PRESETS) {
    if (layout.visible.length !== preset.visible.length) continue;
    if (!layout.visible.every((key, i) => preset.visible[i] === key)) continue;
    if (!sizesMatch(layout.visible, layout.sizes, preset.sizes)) continue;
    return preset.key;
  }
  return null;
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
