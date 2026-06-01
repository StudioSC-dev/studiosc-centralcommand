import type {
  WeatherCurrent,
  WeatherForecastEntry,
  WeatherUnits,
} from "@central-command/types";

/**
 * OpenWeatherMap client — standard free endpoints only:
 *   - Current Weather:  /data/2.5/weather
 *   - 5 Day / 3 Hour:   /data/2.5/forecast
 *
 * One Call API 3.0 is intentionally NOT used (requires a card on file).
 */

const BASE = "https://api.openweathermap.org/data/2.5";

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
  dt: number;
}
interface OwmForecastResponse {
  list: Array<{
    dt: number;
    main: { temp: number };
    weather: OwmWeatherDesc[];
  }>;
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
    return { at: entry.dt * 1000, temp: entry.main.temp, description, icon };
  });
}
