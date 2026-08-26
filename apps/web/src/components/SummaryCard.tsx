import { useState } from "react";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";
import { EventDialog } from "./EventDialog";
import { ClockGlyph, ConferenceGlyph, TravelGlyph } from "./EventGlyphs";
import { useClampList } from "../lib/useClampList";
import { useCalendar } from "../lib/calendar";
import { isSameLocalDay, useNow } from "../lib/time";
import type { CalendarEvent } from "@central-command/types";

/**
 * How long before departure the Next line switches from counting down to the
 * event to counting down to leaving.
 *
 * This window is the answer to "how would the card know if I already left?" —
 * it never claims to. The departure is shown only while it is actionable and
 * disappears when the event starts, so there is no stale state to track, nothing
 * to dismiss, and no moment where the card asserts something it cannot know.
 *
 * **It scales with the journey.** The window is measured from `leaveBy`, which
 * already has travel subtracted, so a long trip surfaces earlier in absolute
 * terms either way. But a flat half hour of notice is thin warning for an hour
 * on the road and generous for a walk downstairs, so the lead time is roughly
 * one journey — floored so a short hop still gives useful notice, capped so a
 * long one cannot camp on the card for half the day.
 */
const DEPARTURE_WINDOW_MIN = 30;
const DEPARTURE_WINDOW_MAX = 90;

function departureWindowMs(travelMinutes: number): number {
  return Math.min(DEPARTURE_WINDOW_MAX, Math.max(DEPARTURE_WINDOW_MIN, travelMinutes)) * 60_000;
}

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

const stressLabel = (s: number) =>
  s >= 75 ? "Overcommitted" : s >= 50 ? "Rushed" : s >= 25 ? "Steady" : "Light";

const gaugeColor = (s: number) =>
  s >= 75 ? "var(--bad)" : s >= 50 ? "var(--warn)" : s >= 25 ? "var(--accent)" : "var(--good)";

/**
 * The departure half of the Next line.
 *
 * Returns null outside the window, which is most of the day — so on an ordinary
 * day this feature costs the card no height at all. That is the whole reason it
 * lives *on* the existing line rather than in a row of its own: the Today card
 * has roughly 44px of slack at 1x1 on a 1080p display, and a new row does not
 * fit in it.
 */
function DepartureNote({ event, now }: { event: CalendarEvent; now: number }) {
  const travel = event.travel;
  if (!travel || event.start <= now) return null;
  if (travel.leaveBy - now > departureWindowMs(travel.minutes)) return null;

  const overdue = now >= travel.leaveBy;
  const minutes = Math.max(0, Math.round((travel.leaveBy - now) / 60_000));
  const mode = travel.mode === "walk" ? "walk" : "drive";

  return (
    <span className={`today-departure${overdue ? " is-late" : " is-tight"}`}>
      {overdue ? <ClockGlyph /> : <TravelGlyph mode={travel.mode} />}
      <span className="today-departure-lead">{overdue ? "Leave now" : `Leave in ${minutes}m`}</span>
      <span className="today-departure-detail">
        · {travel.minutes} min {mode}
      </span>
    </span>
  );
}

/** The day anchor: the next event + how much of a rush today is. */
export function SummaryCard() {
  const { data, isPending, isError, error } = useCalendar();
  const now = useNow();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const { ref: listRef, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) return <Card title="Today" pillar="summary" ownFit>Loading…</Card>;
  if (isError) return <Card title="Today" pillar="summary" ownFit>Unavailable: {error.message}</Card>;

  if (!data.connected) {
    return (
      <Card title="Today" pillar="summary" ownFit>
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
  // The day's true shape, counted before the Next event is removed below: the
  // header describes today, not the list under it.
  const todayCount = todayEvents.length;
  const doneCount = todayEvents.filter((e) => e.end <= now).length;
  // The Next block already renders this event, in more detail than a row can —
  // title, clock, departure. Repeating it directly underneath spends a row on
  // something the eye just read, and a row is the scarcest thing on this tile
  // (the whole list budget is roughly one at 1x1). `next` can be tomorrow's
  // event when today is done, hence matching by id rather than assuming it is
  // in this list at all.
  const listEvents = todayEvents.filter((e) => e.id !== next?.id);
  const stress = data.todayStress;

  return (
    <Card title="Today" pillar="summary" ownFit>
      {next ? (
        <div className="today-next">
          <span className="today-next-label">Next</span>
          <span className="today-next-title">{next.title}</span>
          {/* The clock time always stays; only what follows it changes — the
              departure replaces the countdown when it is close enough to act on,
              rather than adding a line the tile has no room for. */}
          <span className="today-next-when">
            {fmtWhen(next.start, now, next.allDay)}
            {!next.allDay &&
              (hasDeparture(next, now) ? (
                <>
                  {" · "}
                  <DepartureNote event={next} now={now} />
                </>
              ) : (
                <> · {untilLabel(next.start, now)}</>
              ))}
          </span>
        </div>
      ) : (
        <p className="today-empty">Nothing left on the calendar today.</p>
      )}

      <div className="today-shape">
        <div className="today-gauge-row">
          <span className="today-gauge-label">{stressLabel(stress)}</span>
          <span className="today-gauge-count">
            {todayCount} event{todayCount === 1 ? "" : "s"} today
          </span>
        </div>
        <div className="today-gauge-track">
          <span
            className="today-gauge-fill"
            style={{ width: `${stress}%`, background: gaugeColor(stress) }}
          />
          {/* Where density alone would have landed. The distance between the two
              is what travel added — one 2px mark, and the only permanent height
              this feature costs the card. */}
          {data.todayBusyness !== stress && (
            <span
              className="today-gauge-notch"
              style={{ left: `${data.todayBusyness}%` }}
              title={`Scheduled time alone: ${data.todayBusyness}`}
            />
          )}
        </div>
      </div>

      {/* Guarded on the *list*, not the day: when today's only remaining event is
          the one in the Next block, this section would otherwise render as a
          header and a progress count over an empty list. */}
      {listEvents.length > 0 && (
        <div className="today-events">
          <div className="today-events-head">
            <span>Today's schedule</span>
            <span className="today-events-progress">
              {doneCount}/{todayCount} done
            </span>
          </div>
          <ul className="today-event-list" ref={listRef}>
            {listEvents.map((e) => {
              const done = e.end <= now;
              const live = e.start <= now && now < e.end;
              // Only an unmakeable connection earns a row of its own. Tight ones
              // are felt on the Next line and in the gauge; comfortable ones are
              // felt only in the gauge. Space is the scarce thing here.
              const conflict = e.travel && e.travel.bufferMinutes !== null && e.travel.bufferMinutes < 0;
              return (
                <li key={e.id} className="today-event-item">
                  {conflict && e.travel && (
                    <span className="today-hop">
                      <ClockGlyph />
                      {e.travel.minutes} min {e.travel.mode === "walk" ? "walk" : "drive"} ·{" "}
                      {Math.abs(e.travel.bufferMinutes!)} min short
                    </span>
                  )}
                  <button
                    type="button"
                    className={`today-event${done ? " done" : ""}${live ? " live" : ""}`}
                    // A press here opens detail; it is not the long-press that
                    // enters edit mode, so it must not reach the card shell.
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() => setSelected(e)}
                  >
                    <span className="today-event-time">
                      {new Date(e.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="today-event-title">{e.title}</span>
                    {e.conference && (
                      <span className="today-event-glyph">
                        <ConferenceGlyph provider={e.conference.provider} />
                      </span>
                    )}
                    {e.travel && !e.conference && (
                      <span className="today-event-glyph">
                        <TravelGlyph mode={e.travel.mode} />
                      </span>
                    )}
                    {live && <span className="today-event-tag">Now</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <ClippedNote count={clippedCount} noun="event" />
        </div>
      )}

      <EventDialog event={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

/** Whether the departure note is currently rendering, so the countdown yields. */
function hasDeparture(event: CalendarEvent, now: number): boolean {
  const travel = event.travel;
  if (!travel || event.start <= now) return false;
  return travel.leaveBy - now <= departureWindowMs(travel.minutes);
}
