import {
  bandPressure,
  bufferBand,
  DEFAULT_PREP_MINUTES,
  leaveBy,
  spanScore,
  stressScore,
} from "@central-command/utils";
import type { CalendarEvent, EventTravel, StressFactor } from "@central-command/types";
import type { Database } from "../lib/db";
import { geocodeMany, normaliseQuery } from "./geocode-cache";
import { haversineKm, modeFor, routeMinutes, type Coords } from "./openrouteservice";
import { isMappable } from "./maps";

/**
 * Turns today's schedule into departure times and a stress score.
 *
 * The whole feature degrades to nothing rather than guessing: no ORS key, no
 * home coordinates, or an unresolvable location all produce an event with no
 * `travel`, and the card falls back to its plain countdown. A wrong departure
 * time is worse than none.
 */

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;

export interface TravelPlan {
  events: CalendarEvent[];
  todayStress: number;
  stressFactors: StressFactor[];
}

const fmtDuration = (minutes: number): string =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim()
    : `${minutes}m`;

/**
 * Annotate today's events with travel, and score the day.
 *
 * `density` is passed in rather than recomputed so this and `todayBusyness`
 * cannot drift apart — they are the same number, used twice.
 */
export async function planTravel(
  db: Database,
  opts: {
    events: CalendarEvent[];
    dayStart: number;
    dayEnd: number;
    density: number;
    home: Coords | null;
    apiKey?: string;
    prepMinutes?: number;
  },
): Promise<TravelPlan> {
  const { events, dayStart, dayEnd, density, home, apiKey } = opts;
  const prep = opts.prepMinutes ?? DEFAULT_PREP_MINUTES;

  const today = events
    .filter((e) => !e.allDay && e.start >= dayStart && e.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  // The span term needs no geocoding, so it is computed even when routing is
  // unavailable — a long day is a long day whether or not we can route it.
  const committedHours =
    today.length > 0
      ? (Math.max(...today.map((e) => e.end)) - today[0]!.start) / MS_PER_HOUR
      : 0;
  const span = spanScore(committedHours);

  const noTravel = (factors: StressFactor[] = []): TravelPlan => ({
    events,
    todayStress: stressScore({ density, transitionPressures: [], span }),
    stressFactors: [...baseFactors(today, density), ...factors],
  });

  if (!apiKey || !home || today.length === 0) return noTravel();

  const places = today.map((e) => e.location).filter(isMappable);
  if (places.length === 0) return noTravel();

  // Home is the focus point: it is where the calendar lives, and without it
  // a terse location resolves globally (see `geocode()`).
  const coordsByQuery = await geocodeMany(db, places, apiKey, Date.now(), home);
  const coordsFor = (e: CalendarEvent): Coords | null => {
    if (!isMappable(e.location)) return null;
    return coordsByQuery.get(normaliseQuery(e.location)) ?? null;
  };

  const travelById = new Map<string, EventTravel>();
  const pressures: number[] = [];
  let transitMinutes = 0;
  let worst: { event: CalendarEvent; travel: EventTravel } | null = null;

  // Origin walks forward with the day: the first outing starts at home, and each
  // later one starts wherever the last *located* event put you. An event with no
  // location (a call taken anywhere) does not move you, so it does not reset it.
  let origin: Coords = home;
  let originLabel: string | null = null;

  for (let i = 0; i < today.length; i++) {
    const event = today[i]!;
    const destination = coordsFor(event);
    if (!destination) continue;

    const km = haversineKm(origin, destination);
    const mode = modeFor(km);
    const minutes = await routeMinutes(origin, destination, mode, apiKey);

    // Advance the origin even when routing failed — you are still at the venue.
    const advance = () => {
      origin = destination;
      originLabel = event.location;
    };

    if (minutes === null) {
      advance();
      continue;
    }

    const departure = leaveBy(event.start, minutes, prep);
    const previous = today[i - 1];
    const bufferMinutes =
      previous && previous.end <= event.start
        ? Math.round((departure - previous.end) / MS_PER_MIN)
        : null;

    const travel: EventTravel = {
      mode,
      minutes,
      km: Math.round(km * 10) / 10,
      leaveBy: departure,
      originLabel,
      bufferMinutes,
    };
    travelById.set(event.id, travel);
    transitMinutes += minutes;

    if (bufferMinutes !== null) {
      const band = bufferBand(bufferMinutes);
      pressures.push(bandPressure(band));
      if (!worst || bufferMinutes < (worst.travel.bufferMinutes ?? Number.POSITIVE_INFINITY)) {
        worst = { event, travel };
      }
    }

    advance();
  }

  const factors = baseFactors(today, density);
  if (transitMinutes > 0) {
    factors.push({ label: `${fmtDuration(transitMinutes)} in transit`, tone: "neutral" });
  }
  if (worst && worst.travel.bufferMinutes !== null) {
    const buffer = worst.travel.bufferMinutes;
    const band = bufferBand(buffer);
    if (band === "conflict") {
      factors.unshift({
        label: `${worst.event.title} is ${Math.abs(buffer)} min out of reach`,
        tone: "bad",
      });
    } else if (band === "tight") {
      factors.unshift({ label: `${buffer} min to get out the door`, tone: "warn" });
    }
  }

  return {
    events: events.map((e) => {
      const travel = travelById.get(e.id);
      return travel ? { ...e, travel } : e;
    }),
    todayStress: stressScore({ density, transitionPressures: pressures, span }),
    stressFactors: factors,
  };
}

/** Factors that need no travel data — always true, always worth showing. */
function baseFactors(today: CalendarEvent[], density: number): StressFactor[] {
  const scheduledMs = today.reduce((sum, e) => sum + (e.end - e.start), 0);
  const factors: StressFactor[] = [];
  if (scheduledMs > 0) {
    factors.push({ label: `${fmtDuration(Math.round(scheduledMs / MS_PER_MIN))} scheduled`, tone: "neutral" });
  }
  const backToBack = today.filter(
    (e, i) => i > 0 && e.start - today[i - 1]!.end <= 5 * MS_PER_MIN,
  ).length;
  if (backToBack > 0) {
    factors.push({ label: `${backToBack} back-to-back`, tone: density > 60 ? "warn" : "neutral" });
  }
  return factors;
}
