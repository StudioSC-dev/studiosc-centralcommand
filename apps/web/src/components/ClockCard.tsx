import { useSettings } from "../lib/settings";
import { useNow } from "../lib/time";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

/**
 * World Clock — current time across user-configured timezones.
 *
 * No external API: `Intl.DateTimeFormat` handles everything. The zone list
 * lives in `user_settings.clock_zones` (a JSON string[]).
 *
 * **Fit strategy:** the zone list clamps with `useClampList`. At 1x1 this
 * fits ~4–6 zones; at larger sizes, more. The empty-state prompt never drops.
 */

const timeFmt = (zone: string, now: number) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

const dateFmt = (zone: string, now: number) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);

const localDate = (now: number) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);

/** Extract a readable city name from an IANA zone like "America/New_York". */
function cityLabel(zone: string): string {
  const city = zone.split("/").pop() ?? zone;
  return city.replace(/_/g, " ");
}

/** Whether it's currently daytime (6am–6pm) in the given zone. */
function isDaytime(zone: string, now: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hour12: false }).format(now),
  );
  return hour >= 6 && hour < 18;
}

export function ClockCard() {
  const { data, isPending, isError, error } = useSettings();
  const now = useNow(1_000);
  const { ref, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) {
    return (
      <Card title="World Clock" pillar="clock">
        Loading…
      </Card>
    );
  }
  if (isError) {
    return (
      <Card title="World Clock" pillar="clock">
        Clock unavailable: {error.message}
      </Card>
    );
  }

  const zones = data.settings?.clockZones ?? [];
  const today = localDate(now);

  if (zones.length === 0) {
    return (
      <Card title="World Clock" pillar="clock">
        <p className="clock-empty">
          No timezones configured. Add zones in Settings.
        </p>
      </Card>
    );
  }

  return (
    <Card title="World Clock" pillar="clock">
      <ul className="clock-list" ref={ref}>
        {zones.map((zone) => {
          const zoneDate = dateFmt(zone, now);
          const differentDate = zoneDate !== today;
          return (
            <li key={zone} className="clock-zone">
              <span className="clock-zone-day" aria-hidden="true">
                {isDaytime(zone, now) ? "☀" : "☾"}
              </span>
              <span className="clock-zone-city">{cityLabel(zone)}</span>
              <span className="clock-zone-info">
                <span className="clock-zone-time">{timeFmt(zone, now)}</span>
                {differentDate && (
                  <span className="clock-zone-date">{zoneDate}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <ClippedNote count={clippedCount} noun="timezone" />
    </Card>
  );
}
