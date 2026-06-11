import { useState, type ReactNode } from "react";
import type { WeatherCurrent, WeatherData, WeatherDailyEntry } from "@central-command/types";
import { useSetUnits, useWeather } from "../lib/weather";
import { useIsDemo } from "../lib/auth";
import { LocationSetter } from "./LocationSetter";
import { WeatherGlyph, weatherGroup } from "./WeatherGlyph";

type Units = WeatherData["units"];

const fmtTemp = (t: number, units: Units) => `${Math.round(t)}°${units === "imperial" ? "F" : "C"}`;

/** Format an absolute (UTC) instant in the *location's* local time via its offset. */
const fmtClock = (ms: number, offsetSec: number) =>
  new Date(ms + offsetSec * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });

const fmtVisibility = (m: number, units: Units) =>
  units === "imperial" ? `${(m / 1609).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;

/** Day label for the outlook: "Today" for the first entry, else a short weekday. */
const dayLabel = (date: string, idx: number) =>
  idx === 0 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short" });

/** A simple sunrise→sunset arc with the sun positioned by the current daylight fraction. */
function SunArc({ current }: { current: WeatherCurrent }) {
  const { sunrise, sunset, timezoneOffsetSec } = current;
  const now = Date.now();
  const frac = Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)));
  const daytime = now >= sunrise && now <= sunset;
  const a = Math.PI * (1 - frac); // π (sunrise/left) → 0 (sunset/right)
  const cx = 60;
  const cy = 52;
  const r = 46;
  const x = cx + r * Math.cos(a);
  const y = cy - r * Math.sin(a);

  return (
    <div className="weather-sun">
      <svg viewBox="0 0 120 62" className="sun-arc" aria-hidden="true">
        <path className="sun-arc-track" d="M14 52 A46 46 0 0 1 106 52" />
        <circle className={`sun-dot${daytime ? "" : " night"}`} cx={x} cy={y} r="4.5" />
      </svg>
      <div className="weather-sun-times">
        <span>↑ {fmtClock(sunrise, timezoneOffsetSec)}</span>
        <span>↓ {fmtClock(sunset, timezoneOffsetSec)}</span>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="weather-detail">
      <span className="weather-detail-label">{label}</span>
      <span className="weather-detail-value">{value}</span>
    </div>
  );
}

export function WeatherCard() {
  const { data, isPending, isError, error } = useWeather();
  const setUnits = useSetUnits();
  const demo = useIsDemo();
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

  const { current, daily, units, location } = data;
  const today: WeatherDailyEntry | undefined = daily[0];

  return (
    <Card>
      <div className={`weather-hero wx-${weatherGroup(current.icon)}`}>
        <WeatherGlyph icon={current.icon} size={56} />
        <div className="weather-head">
          <span className="weather-temp">{fmtTemp(current.temp, units)}</span>
          <span className="weather-headside">
            <span className="weather-desc">{current.description}</span>
            {today && (
              <span className="weather-hilo">
                H {fmtTemp(today.max, units)} · L {fmtTemp(today.min, units)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="weather-meta">
        {location.label ?? `${location.lat}, ${location.lon}`} · feels{" "}
        {fmtTemp(current.feelsLike, units)}
        {current.rain1h != null && ` · ${current.rain1h}mm rain`}
        {!demo && (
          <>
            {" "}
            ·{" "}
            <button
              type="button"
              className="link-button"
              disabled={setUnits.isPending}
              onClick={() => setUnits.mutate(units === "imperial" ? "metric" : "imperial")}
              title="Toggle units"
            >
              {units === "imperial" ? "°C" : "°F"}
            </button>{" "}
            ·{" "}
            <button type="button" className="link-button" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Change"}
            </button>
          </>
        )}
      </div>
      {editing && <LocationSetter onDone={() => setEditing(false)} />}

      <SunArc current={current} />

      <div className="weather-details">
        <Detail label="Humidity" value={`${current.humidity}%`} />
        <Detail label="Pressure" value={`${current.pressure} hPa`} />
        <Detail label="Visibility" value={fmtVisibility(current.visibility, units)} />
      </div>

      {daily.length > 1 && (
        <ul className="weather-outlook">
          {daily.map((d, i) => (
            <li key={d.date}>
              <span className="weather-outlook-day">{dayLabel(d.date, i)}</span>
              <WeatherGlyph icon={d.icon} size={22} />
              <span className={`weather-pop${d.pop > 0 ? "" : " weather-pop-dry"}`}>
                {d.pop > 0 ? `${Math.round(d.pop * 100)}%` : "—"}
              </span>
              <span className="weather-outlook-temp">
                {Math.round(d.max)}°<span className="weather-outlook-min">{Math.round(d.min)}°</span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
