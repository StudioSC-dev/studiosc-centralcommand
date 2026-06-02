import type {
  GeoCity,
  WeatherCurrent,
  WeatherForecastEntry,
  WeatherUnits,
} from "@central-command/types";

/**
 * OpenWeatherMap client — standard free endpoints only:
 *   - Current Weather:  /data/2.5/weather
 *   - 5 Day / 3 Hour:   /data/2.5/forecast
 *   - Geocoding:        /geo/1.0/direct, /geo/1.0/reverse
 *
 * One Call API 3.0 is intentionally NOT used (requires a card on file).
 */

const BASE = "https://api.openweathermap.org/data/2.5";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0";

/** How many 3-hour forecast slots to surface (8 = next 24h). */
const FORECAST_SLOTS = 8;

// Minimal shapes of the OWM responses (only the fields we consume).
interface OwmWeatherDesc {
  description: string;
  icon: string;
}
interface OwmCurrentResponse {
  main: { temp: number; feels_like: number; humidity: number };
  wind: { speed: number };
  weather: OwmWeatherDesc[];
  rain?: { "1h"?: number };
  dt: number;
}
interface OwmForecastResponse {
  list: Array<{
    dt: number;
    main: { temp: number };
    weather: OwmWeatherDesc[];
    pop?: number;
  }>;
}
interface OwmGeoResponse {
  name: string;
  state?: string;
  country: string;
  lat: number;
  lon: number;
}

function describe(entries: OwmWeatherDesc[]): { description: string; icon: string } {
  const first = entries[0];
  return { description: first?.description ?? "", icon: first?.icon ?? "" };
}

export async function fetchCurrentWeather(opts: {
  lat: number;
  lon: number;
  units: WeatherUnits;
  apiKey: string;
}): Promise<WeatherCurrent> {
  const url = new URL(`${BASE}/weather`);
  url.searchParams.set("lat", String(opts.lat));
  url.searchParams.set("lon", String(opts.lon));
  url.searchParams.set("units", opts.units);
  url.searchParams.set("appid", opts.apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeatherMap current failed: ${res.status}`);
  }
  const data = (await res.json()) as OwmCurrentResponse;
  const { description, icon } = describe(data.weather);

  return {
    temp: data.main.temp,
    feelsLike: data.main.feels_like,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    rain1h: data.rain?.["1h"] ?? null,
    description,
    icon,
    observedAt: data.dt * 1000,
  };
}

export async function fetchForecast(opts: {
  lat: number;
  lon: number;
  units: WeatherUnits;
  apiKey: string;
}): Promise<WeatherForecastEntry[]> {
  const url = new URL(`${BASE}/forecast`);
  url.searchParams.set("lat", String(opts.lat));
  url.searchParams.set("lon", String(opts.lon));
  url.searchParams.set("units", opts.units);
  url.searchParams.set("appid", opts.apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeatherMap forecast failed: ${res.status}`);
  }
  const data = (await res.json()) as OwmForecastResponse;

  return data.list.slice(0, FORECAST_SLOTS).map((entry) => {
    const { description, icon } = describe(entry.weather);
    return { at: entry.dt * 1000, temp: entry.main.temp, pop: entry.pop ?? 0, description, icon };
  });
}

const toGeoCity = (g: OwmGeoResponse): GeoCity => ({
  name: g.name,
  state: g.state ?? null,
  country: g.country,
  lat: g.lat,
  lon: g.lon,
});

/** City search (forward geocoding). Returns up to `limit` matches for a query. */
export async function searchCities(opts: {
  query: string;
  apiKey: string;
  limit?: number;
}): Promise<GeoCity[]> {
  const url = new URL(`${GEO_BASE}/direct`);
  url.searchParams.set("q", opts.query);
  url.searchParams.set("limit", String(opts.limit ?? 5));
  url.searchParams.set("appid", opts.apiKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap geocoding failed: ${res.status}`);
  const data = (await res.json()) as OwmGeoResponse[];
  return data.map(toGeoCity);
}

/** Reverse geocoding — resolve coordinates (e.g. from the browser) to a place. */
export async function reverseGeocode(opts: {
  lat: number;
  lon: number;
  apiKey: string;
}): Promise<GeoCity | null> {
  const url = new URL(`${GEO_BASE}/reverse`);
  url.searchParams.set("lat", String(opts.lat));
  url.searchParams.set("lon", String(opts.lon));
  url.searchParams.set("limit", "1");
  url.searchParams.set("appid", opts.apiKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap reverse geocoding failed: ${res.status}`);
  const data = (await res.json()) as OwmGeoResponse[];
  return data[0] ? toGeoCity(data[0]) : null;
}
