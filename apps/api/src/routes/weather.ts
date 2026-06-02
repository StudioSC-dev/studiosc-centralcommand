import { Hono } from "hono";
import type {
  GeoCity,
  WeatherCurrent,
  WeatherForecastEntry,
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

// KV TTLs (seconds) per CLAUDE.md.
const CURRENT_TTL = 30 * 60;
const FORECAST_TTL = 60 * 60;
const GEO_TTL = 24 * 60 * 60; // place lookups are stable; cache aggressively

/** Round to ~1km so users near each other share a cache entry. */
const round = (n: number) => Math.round(n * 100) / 100;

export const weather = new Hono<AppEnv>()
  // GET /weather/search?q=… — city search for the location picker.
  .get("/search", async (c) => {
    const query = c.req.query("q")?.trim();
    if (!query || query.length < 2) return ok(c, { results: [] as GeoCity[] });

    const cacheKey = `geo:search:${query.toLowerCase()}`;
    let results = await c.env.CACHE.get<GeoCity[]>(cacheKey, "json");
    if (!results) {
      results = await searchCities({ query, apiKey: c.env.OPENWEATHERMAP_API_KEY });
      await c.env.CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: GEO_TTL });
    }
    return ok(c, { results });
  })
  // GET /weather/reverse?lat=&lon=… — resolve browser coordinates to a place.
  .get("/reverse", async (c) => {
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return fail(c, "bad_request", "lat and lon are required numbers.", 400);
    }

    const cacheKey = `geo:reverse:${round(lat)}:${round(lon)}`;
    let result = await c.env.CACHE.get<GeoCity | null>(cacheKey, "json");
    if (result === null) {
      result = await reverseGeocode({ lat, lon, apiKey: c.env.OPENWEATHERMAP_API_KEY });
      await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: GEO_TTL });
    }
    return ok(c, { result });
  })
  // GET /weather — current conditions + forecast for the user's home location.
  .get("/", async (c) => {
  const settings = await getUserSettings(createDb(c.env.DB), c.get("userId"));

  if (settings?.homeLat == null || settings?.homeLon == null) {
    // Sign-up location not set yet — frontend prompts the user to set it.
    return ok(c, { location: null });
  }

  const units: WeatherUnits = c.req.query("units") === "imperial" ? "imperial" : "metric";
  const lat = round(settings.homeLat);
  const lon = round(settings.homeLon);
  const loc = `${units}:${lat}:${lon}`;

  const currentKey = `weather:current:${loc}`;
  let current = await c.env.CACHE.get<WeatherCurrent>(currentKey, "json");
  if (!current) {
    current = await fetchCurrentWeather({ lat, lon, units, apiKey: c.env.OPENWEATHERMAP_API_KEY });
    await c.env.CACHE.put(currentKey, JSON.stringify(current), { expirationTtl: CURRENT_TTL });
  }

  const forecastKey = `weather:forecast:${loc}`;
  let forecast = await c.env.CACHE.get<WeatherForecastEntry[]>(forecastKey, "json");
  if (!forecast) {
    forecast = await fetchForecast({ lat, lon, units, apiKey: c.env.OPENWEATHERMAP_API_KEY });
    await c.env.CACHE.put(forecastKey, JSON.stringify(forecast), { expirationTtl: FORECAST_TTL });
  }

  return ok(c, {
    location: { lat, lon, label: settings.locationLabel ?? null },
    units,
    current,
    forecast,
  });
});
