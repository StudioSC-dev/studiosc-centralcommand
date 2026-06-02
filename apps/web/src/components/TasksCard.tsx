import { useState } from "react";
import { Card } from "./Card";
import type { Task, TaskPriority } from "@central-command/types";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../lib/tasks";

const PRIORITY_LABEL: Record<TaskPriority, string> = { high: "High", med: "Medium", low: "Low" };

/** Native task list — current priorities, independent of calendar time. */
export function TasksCard() {
  const { data, isPending, isError, error } = useTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("med");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), priority },
      { onSuccess: () => setTitle("") },
    );
  };

  if (isPending) return <Card title="Tasks">Loading…</Card>;
  if (isError) return <Card title="Tasks">Tasks unavailable: {error.message}</Card>;

  const open = data.tasks.filter((t) => t.status === "open");
  const doneCount = data.tasks.length - open.length;

  return (
    <Card title="Tasks">
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
        <button type="submit" disabled={create.isPending}>Add</button>
      </form>

      {open.length === 0 ? (
        <p className="news-empty">No open tasks. Add a priority above.</p>
      ) : (
        <ul className="task-list">
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => update.mutate({ id: task.id, status: "done" })}
              onDelete={() => remove.mutate(task.id)}
            />
          ))}
        </ul>
      )}

      {doneCount > 0 && (
        <p className="task-done-count">{doneCount} completed</p>
      )}
    </Card>
  );
}

function TaskRow({
  task,
  onComplete,
  onDelete,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="task-item">
      <button
        type="button"
        className="task-check"
        onClick={onComplete}
        aria-label={`Complete "${task.title}"`}
        title="Mark done"
      />
      <span className={`task-dot prio-${task.priority}`} title={PRIORITY_LABEL[task.priority]} />
      <span className="task-title">{task.title}</span>
      <button type="button" className="task-del" onClick={onDelete} aria-label="Delete task">
        ×
      </button>
    </li>
  );
}
