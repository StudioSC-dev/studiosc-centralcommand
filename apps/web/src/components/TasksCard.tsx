import { useState } from "react";
import { Card } from "./Card";
import { InlineText } from "./inline";
import type { Task, TaskPriority, TaskUpdateInput } from "@central-command/types";
import { useNow } from "../lib/clock";
import { isSameLocalDay } from "../lib/time";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../lib/tasks";
import { useIsDemo } from "../lib/auth";

const PRIORITY_SHORT: Record<TaskPriority, string> = { high: "High", med: "Med", low: "Low" };

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Whole-day difference between a deadline and now (negative = past). */
const daysUntil = (deadline: number, now: number) =>
  Math.round((startOfDay(deadline) - startOfDay(now)) / 86_400_000);

const fmtDeadline = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

/** A <input type="date"> value (local YYYY-MM-DD) → epoch ms at local midnight. */
const dateInputToMs = (value: string): number | null =>
  value ? new Date(`${value}T00:00:00`).getTime() : null;

/** Epoch ms → local YYYY-MM-DD for a date input value (empty when undated). */
const msToDateInput = (ms: number | null): string => {
  if (ms == null) return "";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Native task list — current priorities. Rows edit in place (click the title,
 * priority, or deadline; commit immediately; no Save/Cancel). */
export function TasksCard() {
  const { data, isPending, isError, error } = useTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const demo = useIsDemo();
  const [title, setTitle] = useState("");
  // Minute-level tick so completed-today tasks drop off at local midnight.
  const now = useNow(60_000);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // Textbox-only create: new tasks default to med priority / undated; the
    // user sets those after the fact by clicking the chips in the row.
    create.mutate(
      { title: title.trim(), priority: "med", deadline: null },
      { onSuccess: () => setTitle("") },
    );
  };

  if (isPending) return <Card title="Tasks" pillar="tasks">Loading…</Card>;
  if (isError) return <Card title="Tasks" pillar="tasks">Tasks unavailable: {error.message}</Card>;

  const nowMs = now.getTime();
  // Open tasks plus anything crossed off *today* — completed items linger until
  // the local day ends so the day's progress stays visible and reversible.
  const visible = data.tasks.filter(
    (t) =>
      t.status === "open" ||
      (t.completedAt != null && isSameLocalDay(t.completedAt, nowMs)),
  );
  const doneTodayCount = visible.filter((t) => t.status === "done").length;

  return (
    <Card title="Tasks" pillar="tasks">
      {!demo && (
        <form className="log-form" onSubmit={submit}>
          <input
            placeholder="Add a priority…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" disabled={create.isPending}>Add</button>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="news-empty">No open tasks. Add a priority above.</p>
      ) : (
        <ul className="task-list">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() =>
                update.mutate({ id: task.id, status: task.status === "open" ? "done" : "open" })
              }
              onSave={(patch) => update.mutate(patch)}
              onDelete={() => remove.mutate(task.id)}
            />
          ))}
        </ul>
      )}

      {doneTodayCount > 0 && <p className="task-done-count">{doneTodayCount} done today</p>}
    </Card>
  );
}

/** Relative deadline display — urgency pill for soon/overdue, plain date else. */
function Deadline({ deadline }: { deadline: number }) {
  const now = useNow(60_000).getTime();
  const days = daysUntil(deadline, now);

  if (days < 0) {
    return <span className="task-badge overdue">Overdue · {fmtDeadline(deadline)}</span>;
  }
  if (days <= 2) {
    const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : fmtDeadline(deadline);
    return <span className="task-badge soon">{label}</span>;
  }
  return <span className="task-deadline">{fmtDeadline(deadline)}</span>;
}

/** Color-coded priority chip that doubles as its own editor (native picker,
 * commits on change). */
function PrioritySelect({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
}) {
  return (
    <select
      className={`task-prio prio-${value}`}
      value={value}
      aria-label="Priority"
      onChange={(e) => onChange(e.target.value as TaskPriority)}
    >
      <option value="high">High</option>
      <option value="med">Med</option>
      <option value="low">Low</option>
    </select>
  );
}

/** Deadline column: empty by default ("＋ date" on hover), click reveals a date
 * input that commits on change; clearing it sets the deadline back to null. */
function DeadlineCell({
  deadline,
  done,
  onChange,
}: {
  deadline: number | null;
  done: boolean;
  onChange: (ms: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        className="task-deadline-input"
        autoFocus
        defaultValue={msToDateInput(deadline)}
        aria-label="Deadline"
        onChange={(e) => onChange(dateInputToMs(e.target.value))}
        onBlur={() => setEditing(false)}
      />
    );
  }
  if (deadline == null) {
    return (
      <button type="button" className="task-add-date" onClick={() => setEditing(true)}>
        ＋ date
      </button>
    );
  }
  return (
    <button
      type="button"
      className="task-deadline-btn"
      onClick={() => setEditing(true)}
      aria-label="Edit deadline"
    >
      {done ? (
        <span className="task-deadline">{fmtDeadline(deadline)}</span>
      ) : (
        <Deadline deadline={deadline} />
      )}
    </button>
  );
}

function TaskRow({
  task,
  onToggle,
  onSave,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onSave: (patch: TaskUpdateInput & { id: string }) => void;
  onDelete: () => void;
}) {
  const demo = useIsDemo();
  const done = task.status === "done";

  // Read-only demo: render plain, non-interactive cells.
  if (demo) {
    return (
      <li className={`task-item${done ? " task-item-done" : ""}`}>
        <span className="task-title">{task.title}</span>
        <span className={`task-prio prio-${task.priority}`}>{PRIORITY_SHORT[task.priority]}</span>
        <span className="task-deadline-cell">
          {task.deadline != null && <Deadline deadline={task.deadline} />}
        </span>
        <span className="task-row-spacer" aria-hidden="true" />
        <span className={`task-check${done ? " done" : ""}`} aria-hidden="true">
          {done ? "✓" : ""}
        </span>
      </li>
    );
  }

  return (
    <li className={`task-item${done ? " task-item-done" : ""}`}>
      <InlineText
        className="task-title"
        value={task.title}
        ariaLabel="Task name"
        onCommit={(title) => onSave({ id: task.id, title })}
      />
      <PrioritySelect value={task.priority} onChange={(priority) => onSave({ id: task.id, priority })} />
      <DeadlineCell
        deadline={task.deadline}
        done={done}
        onChange={(deadline) => onSave({ id: task.id, deadline })}
      />
      <button type="button" className="task-del" onClick={onDelete} aria-label="Delete task" title="Delete">
        ×
      </button>
      <button
        type="button"
        className={`task-check${done ? " done" : ""}`}
        onClick={onToggle}
        aria-label={done ? `Reopen "${task.title}"` : `Complete "${task.title}"`}
        title={done ? "Mark open" : "Mark done"}
      >
        {done ? "✓" : ""}
      </button>
    </li>
  );
}
