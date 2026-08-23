import { useState, type ReactNode } from "react";
import type { WeatherCurrent, WeatherData, WeatherDailyEntry } from "@central-command/types";
import { useSetUnits, useWeather } from "../lib/weather";
import { useIsDemo } from "../lib/auth";
import { LocationSetter } from "./LocationSetter";
import { Card as CardShell } from "./Card";
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
    <div className="weather-sun" data-drop-order="3">
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

/**
 * The outlook in words, for tiles too narrow to render legible day chips.
 *
 * Losing the strip is better than shrinking it past the point of being read —
 * but losing it *silently* just leaves a hole. This says the same thing in one
 * line: today's rain chance and range, plus the next wetter day if there is one,
 * which is the part of a five-day strip anyone actually scans for.
 */
function briefOutlook(daily: readonly WeatherDailyEntry[], units: Units): string {
  const today = daily[0];
  if (!today) return "";

  const parts = [
    `Today ${Math.round(today.pop * 100)}% rain`,
    `${fmtTemp(today.max, units)} / ${fmtTemp(today.min, units)}`,
  ];

  // Only worth naming a later day if it is wetter than today — otherwise the
  // line is just repeating what the hero already says.
  let wettest = -1;
  for (let i = 1; i < daily.length; i++) {
    if (daily[i]!.pop > (wettest === -1 ? today.pop : daily[wettest]!.pop)) wettest = i;
  }
  if (wettest > 0) {
    parts.push(`${dayLabel(daily[wettest]!.date, wettest)} ${Math.round(daily[wettest]!.pop * 100)}%`);
  }

  return parts.join(" · ");
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

      <div className="weather-details" data-drop-order="2">
        <Detail label="Humidity" value={`${current.humidity}%`} />
        <Detail label="Pressure" value={`${current.pressure} hPa`} />
        <Detail label="Visibility" value={fmtVisibility(current.visibility, units)} />
      </div>

      {/* Two renderings of the same block, one chosen by tile width in CSS: the
          chips while they are readable, the sentence once they are not. Both
          carry the same drop order, so if the card runs out of *height* the
          outlook still leaves as a unit. */}
      {daily.length > 1 && (
        <p className="weather-outlook-brief" data-drop-order="1">
          {briefOutlook(daily, units)}
        </p>
      )}

      {daily.length > 1 && (
        <ul className="weather-outlook" data-drop-order="1">
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

/** Local alias so every `<Card>` in this file gets the Weather title and pillar.
 * Delegates to the shared shell — see CardShell's `className` note for why. */
function Card({ children }: { children: ReactNode }) {
  return (
    <CardShell title="Weather" pillar="weather" className="weather-card">
      {children}
    </CardShell>
  );
}
