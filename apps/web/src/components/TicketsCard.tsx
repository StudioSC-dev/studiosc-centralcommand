import { Link } from "@tanstack/react-router";
import type { UrgentTicket } from "@central-command/types";
import { useUrgentTickets } from "../lib/tickets";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

const PRIORITY_DOT: Record<number, string> = {
  1: "tk-p-urgent",
  2: "tk-p-high",
  3: "tk-p-medium",
  4: "tk-p-low",
  5: "tk-p-none",
};

const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "None",
};

function formatDue(dueDate: number | null): string | null {
  if (dueDate == null) return null;
  const now = Date.now();
  const daysLeft = Math.ceil((dueDate - now) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `${daysLeft}d`;
}

function TicketRow({ ticket }: { ticket: UrgentTicket }) {
  const due = formatDue(ticket.dueDate);

  return (
    <li className={`tk-row tk-src-${ticket.source}`}>
      <span className={`tk-dot ${PRIORITY_DOT[ticket.priority] ?? "tk-p-none"}`} title={PRIORITY_LABEL[ticket.priority] ?? ""} />
      <a href={ticket.url} target="_blank" rel="noreferrer" className="tk-title">
        {ticket.title}
      </a>
      <span className="tk-meta">
        <span className="tk-project">{ticket.project}</span>
        {due && <span className={`tk-due${due === "overdue" ? " tk-overdue" : ""}`}>{due}</span>}
      </span>
    </li>
  );
}

export function TicketsCard() {
  const { data, isPending, isError, error } = useUrgentTickets();
  const { ref, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) {
    return <Card title="Tickets" pillar="tickets">Loading…</Card>;
  }
  if (isError) {
    return <Card title="Tickets" pillar="tickets">Tickets unavailable: {error.message}</Card>;
  }

  if (!data.connected) {
    return (
      <Card title="Tickets" pillar="tickets">
        <p className="tk-empty">
          <Link to="/settings" className="gh-settings-link">
            Connect Linear or Trello in Settings.
          </Link>
        </p>
      </Card>
    );
  }

  const { items } = data;

  return (
    <Card title="Tickets" pillar="tickets">
      {items.length > 0 ? (
        <ul className="tk-list" ref={ref}>
          {items.map((item) => (
            <TicketRow key={`${item.source}-${item.id}`} ticket={item} />
          ))}
        </ul>
      ) : (
        <p className="tk-clear">All clear</p>
      )}
      <ClippedNote count={clippedCount} noun="ticket" />
    </Card>
  );
}
