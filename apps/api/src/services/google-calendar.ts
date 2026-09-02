import type {
  CalendarEvent,
  ConferenceProvider,
  EventConference,
} from "@central-command/types";

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
interface GoogleConferenceEntryPoint {
  entryPointType?: string; // "video" | "phone" | "sip" | "more"
  uri?: string;
  label?: string;
  meetingCode?: string;
  passcode?: string;
}
interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: unknown[];
  conferenceData?: {
    entryPoints?: GoogleConferenceEntryPoint[];
    conferenceSolution?: { name?: string };
  };
  start: GoogleEventDate;
  end: GoogleEventDate;
}

/** Longest description we forward. Enough for joining instructions, not a novel. */
const MAX_DESCRIPTION = 600;

/**
 * Google's `description` is HTML. Render it as HTML anywhere and every person
 * who can send you an invite gets to run script in the dashboard, so it is
 * flattened here — at the boundary — and the type says `string`, not markup.
 */
export function toPlainText(html: string): string {
  const text = html
    // <br> and </p> are the only tags carrying layout worth keeping.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    // The handful of entities Google actually emits.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text;
}

/** Provider patterns, in the order we test them. `other` is the fallback. */
const PROVIDER_PATTERNS: ReadonlyArray<{ provider: ConferenceProvider; re: RegExp; label: string }> = [
  { provider: "meet", re: /https:\/\/meet\.google\.com\/[a-z0-9-]+/i, label: "Join Google Meet" },
  { provider: "zoom", re: /https:\/\/[\w.-]*zoom\.us\/(?:j|w|s)\/\d+(?:\?[^\s<"']*)?/i, label: "Join Zoom Meeting" },
  {
    provider: "teams",
    re: /https:\/\/teams\.(?:microsoft|live)\.com\/l\/meetup-join\/[^\s<"']+/i,
    label: "Join Teams Meeting",
  },
];

function classify(url: string): { provider: ConferenceProvider; label: string } {
  for (const p of PROVIDER_PATTERNS) if (p.re.test(url)) return { provider: p.provider, label: p.label };
  return { provider: "other", label: "Join call" };
}

/**
 * Find the joinable call on an event, best source first.
 *
 * The regex sweep at the end is not a fallback in practice — it is the common
 * case. `conferenceData` is populated only when the organiser created the call
 * through a Calendar add-on; a Zoom link someone pasted into the invite body is
 * plain text, and that is most of them.
 */
export function detectConference(e: GoogleEvent): EventConference | undefined {
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video" && p.uri);
  if (video?.uri) {
    const { provider, label } = classify(video.uri);
    const solution = e.conferenceData?.conferenceSolution?.name;
    return {
      provider,
      url: video.uri,
      label: solution ? `Join ${solution}` : label,
      ...(video.meetingCode ? { meetingCode: video.meetingCode } : {}),
      ...(video.passcode ? { passcode: video.passcode } : {}),
    };
  }

  if (e.hangoutLink) {
    return { provider: "meet", url: e.hangoutLink, label: "Join Google Meet" };
  }

  // Location first: a link pasted there is unambiguously the way in, whereas a
  // description can also quote a link to some *other* meeting.
  for (const field of [e.location, e.description]) {
    if (!field) continue;
    for (const { provider, re, label } of PROVIDER_PATTERNS) {
      const match = field.match(re);
      if (match) return { provider, url: match[0], label };
    }
  }
  return undefined;
}

function toEvent(e: GoogleEvent): CalendarEvent {
  const allDay = !e.start.dateTime;
  const startStr = e.start.dateTime ?? e.start.date ?? "";
  const endStr = e.end.dateTime ?? e.end.date ?? "";
  const conference = detectConference(e);
  const description = e.description ? toPlainText(e.description) : "";
  return {
    id: e.id,
    title: e.summary ?? "(no title)",
    start: Date.parse(startStr),
    end: Date.parse(endStr),
    allDay,
    location: e.location ?? null,
    ...(conference ? { conference } : {}),
    ...(description ? { description } : {}),
    ...(e.htmlLink ? { htmlLink: e.htmlLink } : {}),
    ...(e.attendees?.length ? { attendeeCount: e.attendees.length } : {}),
  };
}

export interface CreateEventInput {
  title: string;
  start: number; // epoch-ms
  end: number; // epoch-ms
  description?: string;
  location?: string;
}

/** Create a new event on the user's primary calendar. */
export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {
    summary: input.title,
    start: { dateTime: new Date(input.start).toISOString() },
    end: { dateTime: new Date(input.end).toISOString() },
  };
  if (input.description) body.description = input.description;
  if (input.location) body.location = input.location;

  const res = await fetch(EVENTS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar create failed: ${res.status} ${await res.text()}`);
  }
  const event = (await res.json()) as GoogleEvent;
  return toEvent(event);
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
