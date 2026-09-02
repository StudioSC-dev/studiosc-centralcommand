import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCreateEvent } from "../lib/calendar";

/**
 * Minimal event creation dialog, matching EventDialog's portal + native <dialog>
 * pattern. Opens as a modal with focus trap and Escape support.
 */
export function CreateEventDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const createEvent = useCreateEvent();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    d.setMinutes(0);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    d.setMinutes(0);
    d.setHours(d.getHours() + 1);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  });
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const node = ref.current;
    if (node && !node.open) node.showModal();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const start = new Date(`${date}T${startTime}`).getTime();
    const end = new Date(`${date}T${endTime}`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      setError("End must be after start.");
      return;
    }
    setError("");
    createEvent.mutate(
      {
        title: title.trim(),
        start,
        end,
        location: location.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          if (data.needsReconnect) {
            setError("Re-authorize Google Calendar to create events.");
            return;
          }
          onClose();
        },
        onError: () => setError("Failed to create event. Try again."),
      },
    );
  };

  return createPortal(
    <dialog ref={ref} className="event-dialog" onClose={onClose}>
      <form className="create-event-form" onSubmit={handleSubmit}>
        <h2 className="event-dialog-title">New Event</h2>

        <label className="create-event-label">
          Title
          <input
            type="text"
            className="create-event-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>

        <label className="create-event-label">
          Date
          <input
            type="date"
            className="create-event-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <div className="create-event-time-row">
          <label className="create-event-label">
            Start
            <input
              type="time"
              className="create-event-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="create-event-label">
            End
            <input
              type="time"
              className="create-event-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>

        <label className="create-event-label">
          Location
          <input
            type="text"
            className="create-event-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
          />
        </label>

        {error && <p className="create-event-error">{error}</p>}

        <div className="create-event-actions">
          <button type="button" className="create-event-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="create-event-submit" disabled={createEvent.isPending}>
            {createEvent.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
