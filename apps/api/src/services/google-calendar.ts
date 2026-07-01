import type { CalendarEvent } from "@central-command/types";

/**
 * Google Calendar API (read-only). Uses the v3 events list on the user's
 * primary calendar, expanding recurring events into single instances.
 */

const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const WATCH_ENDPOINT = `${EVENTS_ENDPOINT}/watch`;
const STOP_ENDPOINT = "https://www.googleapis.com/calendar/v3/channels/stop";

interface GoogleEventDate {
  dateTime?: string; // RFC3339 for timed events
  date?: string; // YYYY-MM-DD for all-day events
}
interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  start: GoogleEventDate;
  end: GoogleEventDate;
}

function toEvent(e: GoogleEvent): CalendarEvent {
  const allDay = !e.start.dateTime;
  const startStr = e.start.dateTime ?? e.start.date ?? "";
  const endStr = e.end.dateTime ?? e.end.date ?? "";
  return {
    id: e.id,
    title: e.summary ?? "(no title)",
    start: Date.parse(startStr),
    end: Date.parse(endStr),
    allDay,
    location: e.location ?? null,
  };
}

/**
 * Fetch the user's events, soonest first. `timeMin` defaults to now; pass the
 * start of the local day to also include earlier events from today (so the
 * Today card can show what's already been crossed off).
 */
export async function fetchUpcomingEvents(
  accessToken: string,
  opts: { timeMin?: number; maxResults?: number } = {},
): Promise<CalendarEvent[]> {
  const { timeMin = Date.now(), maxResults = 10 } = opts;
  const url = new URL(EVENTS_ENDPOINT);
  url.searchParams.set("timeMin", new Date(timeMin).toISOString());
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar list failed: ${res.status}`);
  }

  const data = (await res.json()) as { items?: GoogleEvent[] };
  return (data.items ?? []).map(toEvent);
}

/**
 * Open a push channel on the user's primary calendar. Google will POST change
 * notifications to `address` (our webhook) until `expiration`, echoing `id` and
 * `token` back in the request headers. `address` must be an HTTPS URL on a
 * domain verified in the Google Cloud console.
 */
export async function watchCalendar(
  accessToken: string,
  opts: { channelId: string; token: string; address: string; ttlSec?: number },
): Promise<{ resourceId: string; expiration: number }> {
  const body: Record<string, unknown> = {
    id: opts.channelId,
    type: "web_hook",
    address: opts.address,
    token: opts.token,
  };
  if (opts.ttlSec) body.params = { ttl: String(opts.ttlSec) };

  const res = await fetch(WATCH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar watch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { resourceId: string; expiration?: string };
  return {
    resourceId: data.resourceId,
    // `expiration` is a stringified epoch-ms; fall back to ~7 days if omitted.
    expiration: data.expiration ? Number(data.expiration) : Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Stop a previously opened channel. Best-effort — a 404 means it already
 * lapsed, which is fine.
 */
export async function stopChannel(
  accessToken: string,
  opts: { channelId: string; resourceId: string },
): Promise<void> {
  const res = await fetch(STOP_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: opts.channelId, resourceId: opts.resourceId }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Calendar channel stop failed: ${res.status}`);
  }
}
