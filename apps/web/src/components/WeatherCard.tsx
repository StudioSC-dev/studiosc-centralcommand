import type { ReactNode } from "react";
import type { WeatherData } from "@central-command/types";
import { useWeather } from "../lib/weather";

const fmtTemp = (t: number, units: WeatherData["units"]) =>
  `${Math.round(t)}°${units === "imperial" ? "F" : "C"}`;

const fmtHour = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric" });

export function WeatherCard() {
  const { data, isPending, isError, error } = useWeather();

  if (isPending) return <Card>Loading weather…</Card>;
  if (isError) return <Card>Weather unavailable: {error.message}</Card>;

  if (data.location === null) {
    return <Card>Set your home location to see weather.</Card>;
  }

  const { current, forecast, units, location } = data;

  return (
    <Card>
      <div className="weather-head">
        <span className="weather-temp">{fmtTemp(current.temp, units)}</span>
        <span className="weather-desc">{current.description}</span>
      </div>
      <div className="weather-meta">
        {location.label ?? `${location.lat}, ${location.lon}`} · feels{" "}
        {fmtTemp(current.feelsLike, units)} · {current.humidity}% humidity
      </div>
      <ul className="weather-forecast">
        {forecast.map((entry) => (
          <li key={entry.at}>
            <span>{fmtHour(entry.at)}</span>
            <span>{fmtTemp(entry.temp, units)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card weather-card">
      <h2 className="card-title">Weather</h2>
      {children}
    </section>
  );
}
