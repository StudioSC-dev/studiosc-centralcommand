import type { ReactNode } from "react";
import type { CalendarEvent } from "@central-command/types";
import { useCalendar } from "../lib/calendar";

const fmtWhen = (e: CalendarEvent) => {
  const d = new Date(e.start);
  if (e.allDay) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export function CalendarCard() {
  const { data, isPending, isError, error } = useCalendar();

  if (isPending) return <Card>Loading calendar…</Card>;
  if (isError) return <Card>Calendar unavailable: {error.message}</Card>;

  if (!data.connected) {
    return (
      <Card>
        <a className="connect-link" href="/api/auth/google">
          Connect Google Calendar
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <p className="cal-busyness">Today's busyness: {data.todayBusyness}/100</p>
      {data.events.length === 0 ? (
        <p>No upcoming events.</p>
      ) : (
        <ul className="cal-events">
          {data.events.map((e) => (
            <li key={e.id}>
              <span className="cal-when">{fmtWhen(e)}</span>
              <span className="cal-title">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card calendar-card">
      <h2 className="card-title">Calendar</h2>
      {children}
    </section>
  );
}
