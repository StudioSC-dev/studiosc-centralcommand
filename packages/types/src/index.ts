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

// ─── Weather ─────────────────────────────────────────────────────────────────

export type WeatherUnits = "metric" | "imperial";

export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
  observedAt: EpochMs;
}

export interface WeatherForecastEntry {
  at: EpochMs;
  temp: number;
  description: string;
  icon: string;
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
