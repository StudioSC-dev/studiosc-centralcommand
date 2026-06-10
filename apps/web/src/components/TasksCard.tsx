import { useState } from "react";
import { Card } from "./Card";
import type { Task, TaskPriority, TaskUpdateInput } from "@central-command/types";
import { useNow } from "../lib/clock";
import { isSameLocalDay } from "../lib/time";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../lib/tasks";
import { useIsDemo } from "../lib/auth";

const PRIORITY_LABEL: Record<TaskPriority, string> = { high: "High", med: "Medium", low: "Low" };

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

/** Native task list — current priorities, triaged by importance (priority) + urgency (deadline). */
export function TasksCard() {
  const { data, isPending, isError, error } = useTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const demo = useIsDemo();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("med");
  const [deadline, setDeadline] = useState("");
  // Minute-level tick so completed-today tasks drop off at local midnight.
  const now = useNow(60_000);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), priority, deadline: dateInputToMs(deadline) },
      {
        onSuccess: () => {
          setTitle("");
          setDeadline("");
        },
      },
    );
  };

  if (isPending) return <Card title="Tasks" pillar="tasks">Loading…</Card>;
  if (isError) return <Card title="Tasks" pillar="tasks">Tasks unavailable: {error.message}</Card>;

  const nowMs = now.getTime();
  // Open tasks plus anything crossed off *today* — completed items linger until the
  // local day ends so the day's progress stays visible and reversible.
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
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            type="date"
            aria-label="Deadline (optional)"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
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

      {doneTodayCount > 0 && (
        <p className="task-done-count">{doneTodayCount} done today</p>
      )}
    </Card>
  );
}

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
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [deadline, setDeadline] = useState(msToDateInput(task.deadline));

  const startEdit = () => {
    setTitle(task.title);
    setPriority(task.priority);
    setDeadline(msToDateInput(task.deadline));
    setEditing(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ id: task.id, title: title.trim(), priority, deadline: dateInputToMs(deadline) });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="task-item task-item-editing">
        <form className="task-edit-form" onSubmit={save}>
          <input
            className="task-edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="task-edit-row">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <button type="submit">Save</button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`task-item${done ? " task-item-done" : ""}`}>
      {demo ? (
        <span className={`task-check${done ? " done" : ""}`} aria-hidden="true">
          {done ? "✓" : ""}
        </span>
      ) : (
        <button
          type="button"
          className={`task-check${done ? " done" : ""}`}
          onClick={onToggle}
          aria-label={done ? `Reopen "${task.title}"` : `Complete "${task.title}"`}
          title={done ? "Mark open" : "Mark done"}
        >
          {done ? "✓" : ""}
        </button>
      )}
      <span className={`task-dot prio-${task.priority}`} title={PRIORITY_LABEL[task.priority]} />
      <span className="task-title">{task.title}</span>
      {!done && task.deadline != null && <Deadline deadline={task.deadline} />}
      {!demo && (
        <>
          <button type="button" className="task-edit" onClick={startEdit} aria-label="Edit task" title="Edit">
            ✎
          </button>
          <button type="button" className="task-del" onClick={onDelete} aria-label="Delete task">
            ×
          </button>
        </>
      )}
    </li>
  );
}
