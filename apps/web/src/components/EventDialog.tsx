import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CalendarEvent } from "@central-command/types";
import { ConferenceGlyph, PinGlyph, TravelGlyph } from "./EventGlyphs";

/**
 * Event detail, opened by clicking a row on the Today or Calendar card.
 *
 * **Why a portal.** `.card` is `overflow: hidden` so it can clip to its rounded
 * corners, which means anything rendered inside a card is clipped by the tile.
 * A panel this size has to leave the card entirely.
 *
 * **Why a native `<dialog>`.** Focus trap, Escape, backdrop and inertness of the
 * page behind it, for free and correct, with no dependency. Hand-rolling those
 * is where accessible modals usually go wrong.
 *
 * This is where the detail the cards cannot afford lives — the dashboard's rule
 * is that a card fits its tile, so the card shows the shape of the day and this
 * shows everything about one event in it.
 */
export function EventDialog({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // `showModal()` cannot be an attribute — a <dialog open> is a non-modal dialog
  // with no backdrop and no focus trap, which looks identical until tested.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (event && !node.open) node.showModal();
    if (!event && node.open) node.close();
  }, [event]);

  // Escape closes the dialog and must go no further: the edit-mode provider
  // listens for it on window, so without this, dismissing a dialog opened from a
  // card in edit mode would also leave edit mode. Capture phase, for the same
  // reason CardSizePicker uses it — window listeners would otherwise see it
  // first. The dialog's own Escape handling still runs via the cancel event.
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [event]);

  const when = event ? formatRange(event) : "";

  return createPortal(
    <dialog
      className="event-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault(); // let React own the open state, not the DOM
        onClose();
      }}
      onClose={onClose}
      // The backdrop is part of the dialog's own box, so a click landing on the
      // dialog element itself (rather than a child) is a click outside.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="event-dialog-title"
    >
      {event && (
        <div className="event-dialog-inner">
          <div className="event-dialog-head">
            <div>
              <h2 className="event-dialog-title" id="event-dialog-title">
                {event.title}
              </h2>
              <p className="event-dialog-when">{when}</p>
            </div>
            <button type="button" className="event-dialog-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {event.conference && (
            <section className="event-dialog-row">
              <p className="event-dialog-label">Joining</p>
              <a
                className="event-dialog-join"
                href={event.conference.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ConferenceGlyph provider={event.conference.provider} />
                {event.conference.label}
              </a>
              {(event.conference.meetingCode || event.conference.passcode) && (
                <div className="event-dialog-codes">
                  {event.conference.meetingCode && (
                    <span>
                      <span className="event-dialog-code-key">Meeting ID</span>
                      <span className="event-dialog-code-value">{event.conference.meetingCode}</span>
                    </span>
                  )}
                  {event.conference.passcode && (
                    <span>
                      <span className="event-dialog-code-key">Passcode</span>
                      <span className="event-dialog-code-value">{event.conference.passcode}</span>
                    </span>
                  )}
                </div>
              )}
            </section>
          )}

          {(event.location || event.mapEmbedUrl || event.travel) && (
            <section className="event-dialog-row">
              <p className="event-dialog-label">Getting there</p>
              {event.location && !event.mapEmbedUrl && (
                <p className="event-dialog-place">
                  <PinGlyph />
                  {event.location}
                </p>
              )}
              {/* The iframe exists only while the dialog is open, so an always-on
                  wall display never loads a map in the background. */}
              {event.mapEmbedUrl && (
                <iframe
                  className="event-dialog-map"
                  src={event.mapEmbedUrl}
                  title={`Map of ${event.location ?? event.title}`}
                  loading="lazy"
                  allowFullScreen
                />
              )}
              {event.travel && (
                <p className={`event-dialog-travel ${travelTone(event.travel.bufferMinutes)}`}>
                  <TravelGlyph mode={event.travel.mode} />
                  Leave {event.travel.originLabel ?? "home"} by{" "}
                  <strong>{fmtClock(event.travel.leaveBy)}</strong> — {event.travel.minutes} min{" "}
                  {event.travel.mode === "walk" ? "walk" : "drive"}, {event.travel.km} km
                </p>
              )}
              {event.mapLinkUrl && (
                <a className="event-dialog-link" href={event.mapLinkUrl} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              )}
            </section>
          )}

          {event.description && (
            <section className="event-dialog-row">
              <p className="event-dialog-label">Details</p>
              {/* Plain text by the time it reaches here — the API strips Google's
                  HTML, because anyone who can send an invite could otherwise put
                  markup on the dashboard. */}
              <p className="event-dialog-description">{event.description}</p>
            </section>
          )}

          {event.htmlLink && (
            <div className="event-dialog-foot">
              <a className="event-dialog-link" href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                Open in Google Calendar
              </a>
            </div>
          )}
        </div>
      )}
    </dialog>,
    document.body,
  );
}

const travelTone = (buffer: number | null): string =>
  buffer === null ? "" : buffer < 0 ? "is-late" : buffer <= 10 ? "is-tight" : "";

const fmtClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "Today · 2:00 – 4:00 PM · 6 guests", degrading as fields are missing. */
function formatRange(event: CalendarEvent): string {
  const start = new Date(event.start);
  const day = start.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const parts = [day];
  if (event.allDay) {
    parts.push("All day");
  } else {
    parts.push(`${fmtClock(event.start)} – ${fmtClock(event.end)}`);
  }
  if (event.attendeeCount) {
    parts.push(`${event.attendeeCount} guest${event.attendeeCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
