import type { TravelMode } from "@central-command/types";

/**
 * OpenRouteService — geocoding and routed travel times for the "leave by"
 * estimate on the Today card.
 *
 * WHY ORS AND NOT GOOGLE. Google's Maps Embed API is free, but Geocoding and
 * Routes are metered SKUs, and since March 2025 the flat $200 credit is gone in
 * favour of per-SKU free caps. ORS's free plan is 2,500 requests/day and 40,000
 * /month with no credit card, which satisfies the zero-cost prime directive
 * outright. We use Google for the map picture and ORS for the numbers.
 *
 * Unlike the Maps Embed key, `ORS_API_KEY` is a real secret: every call here is
 * server-side and it never reaches the browser.
 *
 * BUDGET. Calls happen only on a calendar cache miss (~96/day worst case for one
 * always-on display), and geocoding — the repeated part — is cached in D1. A
 * day with three trips costs a handful of routing calls, so the 2,500/day cap is
 * not a constraint at any realistic user count.
 */

const GEOCODE_ENDPOINT = "https://api.openrouteservice.org/geocode/search";
const DIRECTIONS_ENDPOINT = "https://api.openrouteservice.org/v2/directions";

/** ORS routing profiles, one per travel mode we support. */
const PROFILE: Record<TravelMode, string> = {
  walk: "foot-walking",
  drive: "driving-car",
};

/**
 * The developer's rule: a destination within this many km of the leg's origin
 * is walked, anything further is driven. Measured straight-line, not routed —
 * the mode has to be chosen *before* we know which profile to route with.
 */
export const WALK_RADIUS_KM = 2;

/** Anything slower than this is not a network problem worth waiting on. */
const TIMEOUT_MS = 4_000;

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export interface Coords {
  lat: number;
  lon: number;
}

/**
 * Great-circle distance in km.
 *
 * This is what picks walk vs drive, and it is deliberately the straight-line
 * distance rather than a routed one: choosing the profile is a prerequisite for
 * routing, so using a route here would be circular. It also means the 2 km rule
 * is slightly generous — real walking distance always exceeds the crow flight —
 * which errs toward leaving earlier, the safe direction for a departure time.
 */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mode for a leg, by the 2 km straight-line rule. */
export function modeFor(distanceKm: number): TravelMode {
  return distanceKm <= WALK_RADIUS_KM ? "walk" : "drive";
}

async function fetchJson(url: URL): Promise<unknown | null> {
  // Every caller treats null as "no estimate available", and the Today card
  // degrades to a plain countdown — so a slow or unhappy geocoder costs the
  // departure line, never the calendar response.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Layers too coarse to be a destination. A country or region centroid is not a
 * place you can drive to — the Philippines centroid is in the sea — and routing
 * from one either fails or, worse, succeeds against some arbitrary nearby road.
 */
const COARSE_LAYERS = new Set(["country", "dependency", "macroregion", "region", "macrocounty"]);

/** How many candidates to request before filtering. */
const GEOCODE_CANDIDATES = 5;

/**
 * Radius of the search constraint around the user's home, in km.
 *
 * Wide enough for any journey you would actually drive to in a day, narrow
 * enough to exclude the rest of the planet. An event further away than this is a
 * flight, where a driving estimate would be meaningless anyway — so failing to
 * resolve it is the right outcome, not a gap.
 */
const SEARCH_RADIUS_KM = 150;

/**
 * Resolve a free-text place to coordinates. Returns null when there is no
 * confident answer, which the caller caches as a miss so it is not re-asked.
 *
 * **`near` is doing the heavy lifting, and it must be a hard constraint.**
 * Calendar locations are terse, messy and globally ambiguous, and this was
 * established the hard way against a real address in Alabang:
 *
 * - Unconstrained, the full string returned only two `country` results (Pelias
 *   latches onto the trailing "Philippines"), and a truncated version returned
 *   five streets in England — each with confidence 1.0.
 * - `focus.point`, which only *biases* ranking, changed nothing: still England.
 * - `boundary.circle` — a hard filter — put the correct venue first on the very
 *   first try.
 *
 * So confidence is not a quality signal here (it measures string match, not
 * plausibility), and a soft hint is not enough. Constrain the search, then trust
 * Pelias's ordering.
 *
 * **Take the first survivor, not the nearest.** Ranking the constrained results
 * by distance from home was tried and is actively wrong: for that same address
 * it picked a venue 3.8 km away over the correct one 15.6 km away, purely
 * because it was closer. Once the search area is bounded, relevance beats
 * proximity.
 *
 * Note this is a *venue* geocoder, unlike the OpenWeatherMap one already in this
 * codebase — that one resolves cities only ("Manila"), and cannot resolve
 * "Cafe Mura" or a street address. They are not interchangeable.
 */
export async function geocode(
  text: string,
  apiKey: string,
  near?: Coords,
): Promise<GeocodeResult | null> {
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", text);
  url.searchParams.set("size", String(GEOCODE_CANDIDATES));
  if (near) {
    url.searchParams.set("boundary.circle.lat", String(near.lat));
    url.searchParams.set("boundary.circle.lon", String(near.lon));
    url.searchParams.set("boundary.circle.radius", String(SEARCH_RADIUS_KM));
  }

  const data = (await fetchJson(url)) as
    | {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: { label?: string; layer?: string };
        }>;
      }
    | null;

  for (const feature of data?.features ?? []) {
    if (COARSE_LAYERS.has(feature.properties?.layer ?? "")) continue;
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) continue;
    // GeoJSON is [lon, lat] — the reverse of every other pair in this codebase.
    const [lon, lat] = coordinates;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    return { lat, lon, label: feature.properties?.label ?? text };
  }
  return null;
}

/**
 * Routed duration in minutes for a leg, or null if ORS cannot route it.
 *
 * Rounded up: a departure time derived from a rounded-down duration tells you to
 * leave later than you should, and being 30 seconds late is a worse failure than
 * being 30 seconds early.
 */
export async function routeMinutes(
  from: Coords,
  to: Coords,
  mode: TravelMode,
  apiKey: string,
): Promise<number | null> {
  const url = new URL(`${DIRECTIONS_ENDPOINT}/${PROFILE[mode]}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("start", `${from.lon},${from.lat}`);
  url.searchParams.set("end", `${to.lon},${to.lat}`);

  const data = (await fetchJson(url)) as
    | { features?: Array<{ properties?: { summary?: { duration?: number } } }> }
    | null;

  const seconds = data?.features?.[0]?.properties?.summary?.duration;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return Math.ceil(seconds / 60);
}
