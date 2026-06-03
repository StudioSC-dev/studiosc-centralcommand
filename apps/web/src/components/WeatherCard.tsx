import { useState, type ReactNode } from "react";
import type { WeatherData } from "@central-command/types";
import { useWeather } from "../lib/weather";
import { LocationSetter } from "./LocationSetter";
import { WeatherGlyph, weatherGroup } from "./WeatherGlyph";

const fmtTemp = (t: number, units: WeatherData["units"]) =>
  `${Math.round(t)}°${units === "imperial" ? "F" : "C"}`;

const fmtHour = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric" });

export function WeatherCard() {
  const { data, isPending, isError, error } = useWeather();
  const [editing, setEditing] = useState(false);

  if (isPending) return <Card>Loading weather…</Card>;
  if (isError) return <Card>Weather unavailable: {error.message}</Card>;

  if (data.location === null) {
    return (
      <Card>
        <p className="weather-meta">Set your home location to see weather.</p>
        <LocationSetter />
      </Card>
    );
  }

  const { current, forecast, units, location } = data;

  return (
    <Card>
      <div className={`weather-hero wx-${weatherGroup(current.icon)}`}>
        <WeatherGlyph icon={current.icon} size={56} />
        <div className="weather-head">
          <span className="weather-temp">{fmtTemp(current.temp, units)}</span>
          <span className="weather-desc">{current.description}</span>
        </div>
      </div>
      <div className="weather-meta">
        {location.label ?? `${location.lat}, ${location.lon}`} · feels{" "}
        {fmtTemp(current.feelsLike, units)} · {current.humidity}% humidity
        {current.rain1h != null && ` · ${current.rain1h}mm rain`} ·{" "}
        <button type="button" className="link-button" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Change"}
        </button>
      </div>
      {editing && <LocationSetter onDone={() => setEditing(false)} />}
      <ul className="weather-forecast">
        {forecast.map((entry) => (
          <li key={entry.at}>
            <span>{fmtHour(entry.at)}</span>
            <WeatherGlyph icon={entry.icon} size={22} />
            <span>{fmtTemp(entry.temp, units)}</span>
            {entry.pop > 0 && <span className="weather-pop">{Math.round(entry.pop * 100)}%</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card weather-card pillar-weather">
      <h2 className="card-title">Weather</h2>
      <div className="card-body">{children}</div>
    </section>
  );
}
