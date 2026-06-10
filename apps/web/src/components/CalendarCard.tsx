import { Card } from "./Card";
import { useCalendar } from "../lib/calendar";
import { isSameLocalDay, useNow } from "../lib/time";
import type { CalendarEvent } from "@central-command/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Total upcoming events to surface across the week (+ overflow). */
const MAX_EVENTS = 10;

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

function EventRow({ e, now }: { e: CalendarEvent; now: number }) {
  const live = !e.allDay && e.start <= now && now < e.end;
  return (
    <li className={`cal-event${live ? " live" : ""}`}>
      <span className="cal-event-when">{fmtWhen(e, now)}</span>
      <span className="cal-event-body">
        <span className="cal-event-title">
          {e.title}
          {live && <span className="cal-event-tag">Now</span>}
        </span>
        {e.location && <span className="cal-event-loc">{e.location}</span>}
      </span>
    </li>
  );
}

/** Calendar as an upcoming-week agenda: events for the next 7 days (up to 10),
 * with a divider for anything that spills past this week. */
export function CalendarCard() {
  const { data, isPending, isError, error } = useCalendar();
  const now = useNow();

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
      <ul className="cal-week">
        {thisWeek.map((e) => (
          <EventRow key={e.id} e={e} now={now} />
        ))}
        {after.length > 0 && (
          <>
            <li className="cal-divider">events after this week</li>
            {after.map((e) => (
              <EventRow key={e.id} e={e} now={now} />
            ))}
          </>
        )}
      </ul>
    </Card>
  );
}
