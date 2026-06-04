import { dayKey } from "@central-command/utils";
import { weatherSnapshots } from "@central-command/db";
import type { WeatherCurrent, WeatherUnits } from "@central-command/types";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

/** Convert a temperature in the fetched units to canonical Celsius. */
export const toCelsius = (temp: number, units: WeatherUnits): number =>
  units === "imperial" ? ((temp - 32) * 5) / 9 : temp;

/**
 * Upsert one representative weather snapshot per user per local day. Called when
 * the weather route serves fresh data; populates the previously-empty
 * `weather_snapshots` table so Insights can correlate conditions with outcomes.
 * `tempC` is always stored canonical-metric regardless of the user's units.
 */
export async function persistWeatherSnapshot(
  db: Database,
  userId: string,
  current: WeatherCurrent,
  units: WeatherUnits,
  timeZone?: string,
): Promise<void> {
  const date = dayKey(Date.now(), timeZone);
  const tempC = Math.round(toCelsius(current.temp, units) * 10) / 10;
  const now = Date.now();

  await db
    .insert(weatherSnapshots)
    .values({
      id: newId(),
      userId,
      date,
      tempC,
      condition: current.description || null,
      rain1h: current.rain1h,
      capturedAt: now,
    })
    .onConflictDoUpdate({
      target: [weatherSnapshots.userId, weatherSnapshots.date],
      set: { tempC, condition: current.description || null, rain1h: current.rain1h, capturedAt: now },
    });
}
