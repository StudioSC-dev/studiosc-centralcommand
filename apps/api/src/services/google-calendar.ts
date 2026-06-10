import type { CalendarEvent } from "@central-command/types";

/**
 * Google Calendar API (read-only). Uses the v3 events list on the user's
 * primary calendar, expanding recurring events into single instances.
 */

const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
