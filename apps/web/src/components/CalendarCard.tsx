import { useState } from "react";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";
import { EventDialog } from "./EventDialog";
import { ConferenceGlyph, TravelGlyph } from "./EventGlyphs";
import { useClampList } from "../lib/useClampList";
import { useCalendar } from "../lib/calendar";
import { isSameLocalDay, useNow } from "../lib/time";
import type { CalendarEvent } from "@central-command/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Total upcoming events to surface across the week (+ overflow). */
// Render ceiling only — how many events actually SHOW is measured per tile by
// useClampList. This just bounds the DOM for a very busy calendar.
const MAX_EVENTS = 30;

/** "3:00 PM" for today, else "Mon, Jun 12 · 3:00 PM"; all-day shows the date. */
function fmtWhen(e: CalendarEvent, now: number): string {
  const d = new Date(e.start);
  const today = isSameLocalDay(e.start, now);
  if (e.allDay) {
    return today ? "All day" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (today) return time;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

function EventRow({ e, now, onOpen }: { e: CalendarEvent; now: number; onOpen: (e: CalendarEvent) => void }) {
  const live = !e.allDay && e.start <= now && now < e.end;
  // A location holding a conference URL is not a place — the glyph and the
  // dialog's Join button say the same thing better than a wall of raw URL.
  const locationIsLink = e.location ? /^(https?:\/\/|www\.)/i.test(e.location.trim()) : false;
  return (
    <li className={`cal-event${live ? " live" : ""}`}>
      {/* The row is the control: every event opens the same dialog the Today
          card uses. `onPointerDown` stops here so a press is a click, not the
          long-press that puts the dashboard into edit mode. */}
      <button
        type="button"
        className="cal-event-button"
        onPointerDown={(ev) => ev.stopPropagation()}
        onClick={() => onOpen(e)}
      >
        <span className="cal-event-when">{fmtWhen(e, now)}</span>
        <span className="cal-event-body">
          <span className="cal-event-title">
            {e.title}
            {live && <span className="cal-event-tag">Now</span>}
          </span>
          {e.location && !locationIsLink && <span className="cal-event-loc">{e.location}</span>}
          {e.conference && locationIsLink && <span className="cal-event-loc">{e.conference.label}</span>}
        </span>
        <span className="cal-event-glyphs">
          {e.conference && <ConferenceGlyph provider={e.conference.provider} />}
          {e.travel && !e.conference && <TravelGlyph mode={e.travel.mode} />}
        </span>
      </button>
    </li>
  );
}

/** Calendar as an upcoming-week agenda: events for the next 7 days (up to 10),
 * with a divider for anything that spills past this week. */
export function CalendarCard() {
  const { data, isPending, isError, error } = useCalendar();
  const now = useNow();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const { ref: listRef, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) return <Card title="Calendar" pillar="calendar">Loading calendar…</Card>;
  if (isError) return <Card title="Calendar" pillar="calendar">Calendar unavailable: {error.message}</Card>;

  if (!data.connected) {
    return (
      <Card title="Calendar" pillar="calendar">
        {data.needsReconnect && (
          <p className="news-empty">Google Calendar access expired. Reconnect to restore events.</p>
        )}
        <a className="connect-link" href="/api/auth/google">
          {data.needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </a>
      </Card>
    );
  }

  // Upcoming only (drop today's already-finished events — the Today card owns those).
  const upcoming = data.events.filter((e) => e.end > now).sort((a, b) => a.start - b.start);
  const weekEnd = now + 7 * DAY_MS;
  const thisWeek = upcoming.filter((e) => e.start < weekEnd).slice(0, MAX_EVENTS);
  const after = upcoming.filter((e) => e.start >= weekEnd).slice(0, MAX_EVENTS - thisWeek.length);

  if (thisWeek.length === 0 && after.length === 0) {
    return (
      <Card title="Calendar" pillar="calendar">
        <p className="news-empty">Nothing on the calendar in the week ahead.</p>
      </Card>
    );
  }

  return (
    <Card title="Calendar" pillar="calendar">
      <ul className="cal-week" ref={listRef}>
        {thisWeek.map((e) => (
          <EventRow key={e.id} e={e} now={now} onOpen={setSelected} />
        ))}
        {after.length > 0 && (
          <>
            <li className="cal-divider">events after this week</li>
            {after.map((e) => (
              <EventRow key={e.id} e={e} now={now} onOpen={setSelected} />
            ))}
          </>
        )}
      </ul>
      <ClippedNote count={clippedCount} noun="event" />
      <EventDialog event={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
