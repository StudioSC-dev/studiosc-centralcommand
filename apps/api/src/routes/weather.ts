import { Hono } from "hono";
import type {
  GeoCity,
  WeatherCurrent,
  WeatherForecast,
  WeatherUnits,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getUserSettings } from "../services/users";
import {
  fetchCurrentWeather,
  fetchForecast,
  reverseGeocode,
  searchCities,
} from "../services/openweathermap";
import { persistWeatherSnapshot } from "../services/weather";
import { demoWeather } from "../demo/fixtures";
import { allowGlobalDaily, allowUserDaily } from "../services/rate-limit";

// KV TTLs (seconds) per CLAUDE.md.
const CURRENT_TTL = 30 * 60;
const FORECAST_TTL = 60 * 60;
const GEO_TTL = 24 * 60 * 60; // place lookups are stable; cache aggressively

/** Round to ~1km so users near each other share a cache entry. */
const round = (n: number) => Math.round(n * 100) / 100;

export const weather = new Hono<AppEnv>()
  // GET /weather/search?q=… — city search for the location picker.
  .get("/search", async (c) => {
    if (c.get("isDemo")) return ok(c, { results: [] as GeoCity[] });
    const query = c.req.query("q")?.trim();
    if (!query || query.length < 2) return ok(c, { results: [] as GeoCity[] });

    const cacheKey = `geo:search:${query.toLowerCase()}`;
    let results = await c.env.CACHE.get<GeoCity[]>(cacheKey, "json");
    if (!results) {
      const u = await allowUserDaily(c.env, c.get("userId"), "geocode");
      const g = await allowGlobalDaily(c.env, "owm-geo");
      if (!u.allowed || !g.allowed) return fail(c, "rate_limited", "Search limit reached. Try later.", 429);
      results = await searchCities({ query, apiKey: c.env.OPENWEATHERMAP_API_KEY });
      await c.env.CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: GEO_TTL });
    }
    return ok(c, { results });
  })
  // GET /weather/reverse?lat=&lon=… — resolve browser coordinates to a place.
  .get("/reverse", async (c) => {
    if (c.get("isDemo")) return ok(c, { result: null });
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return fail(c, "bad_request", "lat and lon are required numbers.", 400);
    }

    const cacheKey = `geo:reverse:${round(lat)}:${round(lon)}`;
    let result = await c.env.CACHE.get<GeoCity | null>(cacheKey, "json");
    if (result === null) {
      const u = await allowUserDaily(c.env, c.get("userId"), "geocode");
      const g = await allowGlobalDaily(c.env, "owm-geo");
      if (!u.allowed || !g.allowed) return fail(c, "rate_limited", "Lookup limit reached. Try later.", 429);
      result = await reverseGeocode({ lat, lon, apiKey: c.env.OPENWEATHERMAP_API_KEY });
      await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: GEO_TTL });
    }
    return ok(c, { result });
  })
  // GET /weather — current conditions + forecast for the user's home location.
  .get("/", async (c) => {
  // Demo: serve a fixture (no OpenWeatherMap call, no KV write).
  if (c.get("isDemo")) return ok(c, demoWeather());

  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const settings = await getUserSettings(db, userId);

  if (settings?.homeLat == null || settings?.homeLon == null) {
    // Sign-up location not set yet — frontend prompts the user to set it.
    return ok(c, { location: null });
  }

  // Units: explicit query param wins, else the user's saved preference, else metric.
  const queryUnits = c.req.query("units");
  const units: WeatherUnits =
    queryUnits === "imperial" || queryUnits === "metric"
      ? queryUnits
      : settings.units === "imperial"
        ? "imperial"
        : "metric";
  const lat = round(settings.homeLat);
  const lon = round(settings.homeLon);
  const loc = `${units}:${lat}:${lon}`;

  const currentKey = `weather:current:${loc}`;
  let current = await c.env.CACHE.get<WeatherCurrent>(currentKey, "json");
  if (!current) {
    const u = await allowUserDaily(c.env, userId, "weather");
    const g = await allowGlobalDaily(c.env, "owm");
    if (!u.allowed || !g.allowed) return fail(c, "rate_limited", "Weather refresh limit reached. Try later.", 429);
    current = await fetchCurrentWeather({ lat, lon, units, apiKey: c.env.OPENWEATHERMAP_API_KEY });
    await c.env.CACHE.put(currentKey, JSON.stringify(current), { expirationTtl: CURRENT_TTL });
    // Record one snapshot per local day for the correlation insight (best-effort).
    try {
      await persistWeatherSnapshot(db, userId, current, units, settings.timezone ?? undefined);
    } catch {
      // Never let snapshot persistence break the weather response.
    }
  }

  // v2 key: the cached shape changed from an array to { hourly, daily }.
  const forecastKey = `weather:forecast:v2:${loc}`;
  let forecast = await c.env.CACHE.get<WeatherForecast>(forecastKey, "json");
  if (!forecast) {
    const g = await allowGlobalDaily(c.env, "owm");
    if (!g.allowed) return fail(c, "rate_limited", "Weather refresh limit reached. Try later.", 429);
    forecast = await fetchForecast({ lat, lon, units, apiKey: c.env.OPENWEATHERMAP_API_KEY });
    await c.env.CACHE.put(forecastKey, JSON.stringify(forecast), { expirationTtl: FORECAST_TTL });
  }

  return ok(c, {
    location: { lat, lon, label: settings.locationLabel ?? null },
    units,
    current,
    forecast: forecast.hourly,
    daily: forecast.daily,
  });
});
