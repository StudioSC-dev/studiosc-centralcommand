import { Card } from "./Card";
import { useCalendar } from "../lib/calendar";
import { isSameLocalDay, useNow } from "../lib/time";

function fmtWhen(ms: number, now: number, allDay: boolean): string {
  const d = new Date(ms);
  const sameDay = isSameLocalDay(ms, now);
  if (allDay) return sameDay ? "All day" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** Human countdown to a start time: "now", "in 45m", "in 2h 15m", "in 3d". */
function untilLabel(start: number, now: number): string {
  const diff = start - now;
  if (diff <= 0) return "now";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  if (hr < 24) return rem ? `in ${hr}h ${rem}m` : `in ${hr}h`;
  return `in ${Math.round(hr / 24)}d`;
}

const busynessLabel = (b: number) =>
  b >= 75 ? "Packed" : b >= 50 ? "Busy" : b >= 25 ? "Moderate" : "Light";

const gaugeColor = (b: number) =>
  b >= 75 ? "var(--bad)" : b >= 50 ? "var(--warn)" : b >= 25 ? "var(--accent)" : "var(--good)";

/** The day anchor: the next event + a sense of how busy today is. */
export function SummaryCard() {
  const { data, isPending, isError, error } = useCalendar();
  const now = useNow();

  if (isPending) return <Card title="Today" pillar="summary">Loading…</Card>;
  if (isError) return <Card title="Today" pillar="summary">Unavailable: {error.message}</Card>;

  if (!data.connected) {
    return (
      <Card title="Today" pillar="summary">
        <p className="today-empty">Connect your calendar to anchor your day.</p>
        <a className="connect-link" href="/api/auth/google">
          Connect Google Calendar
        </a>
      </Card>
    );
  }

  const next = data.events.find((e) => e.end > now) ?? null;
  const todayEvents = data.events
    .filter((e) => !e.allDay && isSameLocalDay(e.start, now))
    .sort((a, b) => a.start - b.start);
  const todayCount = todayEvents.length;
  const doneCount = todayEvents.filter((e) => e.end <= now).length;
  const busyness = data.todayBusyness;

  return (
    <Card title="Today" pillar="summary">
      {next ? (
        <div className="today-next">
          <span className="today-next-label">Next</span>
          <span className="today-next-title">{next.title}</span>
          <span className="today-next-when">
            {fmtWhen(next.start, now, next.allDay)}
            {!next.allDay && <> · {untilLabel(next.start, now)}</>}
          </span>
        </div>
      ) : (
        <p className="today-empty">Nothing left on the calendar today.</p>
      )}

      <div className="today-shape">
        <div className="today-gauge-row">
          <span className="today-gauge-label">{busynessLabel(busyness)}</span>
          <span className="today-gauge-count">
            {todayCount} event{todayCount === 1 ? "" : "s"} today
          </span>
        </div>
        <div className="today-gauge-track">
          <span
            className="today-gauge-fill"
            style={{ width: `${busyness}%`, background: gaugeColor(busyness) }}
          />
        </div>
      </div>

      {todayCount > 0 && (
        <div className="today-events">
          <div className="today-events-head">
            <span>Today's schedule</span>
            <span className="today-events-progress">
              {doneCount}/{todayCount} done
            </span>
          </div>
          <ul className="today-event-list">
            {todayEvents.map((e) => {
              const done = e.end <= now;
              const live = e.start <= now && now < e.end;
              return (
                <li key={e.id} className={`today-event${done ? " done" : ""}${live ? " live" : ""}`}>
                  <span className="today-event-time">
                    {new Date(e.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="today-event-title">{e.title}</span>
                  {live && <span className="today-event-tag">Now</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
