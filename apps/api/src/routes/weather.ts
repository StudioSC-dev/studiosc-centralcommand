import { Hono } from "hono";
import type {
  WeatherCurrent,
  WeatherForecastEntry,
  WeatherUnits,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { getUserSettings } from "../services/users";
import { fetchCurrentWeather, fetchForecast } from "../services/openweathermap";

// KV TTLs (seconds) per CLAUDE.md.
const CURRENT_TTL = 30 * 60;
const FORECAST_TTL = 60 * 60;

/** Round to ~1km so users near each other share a cache entry. */
const round = (n: number) => Math.round(n * 100) / 100;

/** GET /weather — current conditions + forecast for the user's home location. */
export const weather = new Hono<AppEnv>().get("/", async (c) => {
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
