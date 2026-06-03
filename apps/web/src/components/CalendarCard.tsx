import { Card } from "./Card";
import { useCalendar } from "../lib/calendar";
import { isSameLocalDay, useNow } from "../lib/time";

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** How far ahead to show timed events (next-few-hours day view). */
const HORIZON_MS = 12 * 60 * 60 * 1000;
const MAX_TIMED = 6;

/** Calendar as a next-few-hours timeline rather than a flat list. */
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

  const allDay = data.events.filter((e) => e.allDay && isSameLocalDay(e.start, now));
  const timed = data.events
    .filter((e) => !e.allDay && e.end > now && e.start - now < HORIZON_MS)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_TIMED);

  return (
    <Card title="Calendar" pillar="calendar">
      {allDay.length > 0 && (
        <div className="cal-allday">
          {allDay.map((e) => (
            <span key={e.id}>{e.title}</span>
          ))}
        </div>
      )}

      {timed.length === 0 ? (
        <p className="news-empty">Nothing scheduled for the next few hours.</p>
      ) : (
        <ul className="timeline">
          {timed.map((e) => {
            const live = e.start <= now && now < e.end;
            return (
              <li key={e.id} className={`timeline-item${live ? " live" : ""}`}>
                <div className="timeline-time">
                  <span>{fmtTime(e.start)}</span>
                  <span className="timeline-dash">{fmtTime(e.end)}</span>
                </div>
                <div className="timeline-marker" />
                <div className="timeline-body">
                  <span className="timeline-title">
                    {e.title}
                    {live && <span className="timeline-live-tag">Now</span>}
                  </span>
                  {e.location && <span className="timeline-loc">{e.location}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
