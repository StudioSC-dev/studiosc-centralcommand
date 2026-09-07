const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

interface GoogleTaskList {
  id: string;
  title: string;
}

interface GoogleTask {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due?: string;
  updated: string;
  completed?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due: number | null;
  updated: number;
  completed: number | null;
}

export async function fetchTaskLists(
  accessToken: string,
): Promise<GoogleTaskList[]> {
  const res = await fetch(`${TASKS_API}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Tasks lists failed: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleTaskList[] };
  return data.items ?? [];
}

export async function fetchTasks(
  accessToken: string,
  listId: string,
): Promise<GoogleTaskItem[]> {
  const url = new URL(`${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`);
  url.searchParams.set("showCompleted", "true");
  url.searchParams.set("showHidden", "true");
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Tasks list failed: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleTask[] };
  return (data.items ?? []).map(toItem);
}

export async function createGoogleTask(
  accessToken: string,
  listId: string,
  task: { title: string; notes?: string; due?: number },
): Promise<GoogleTaskItem> {
  const body: Record<string, unknown> = { title: task.title };
  if (task.notes) body.notes = task.notes;
  if (task.due) body.due = new Date(task.due).toISOString();

  const res = await fetch(`${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Tasks create failed: ${res.status}`);
  return toItem((await res.json()) as GoogleTask);
}

export async function updateGoogleTask(
  accessToken: string,
  listId: string,
  taskId: string,
  updates: { title?: string; status?: "needsAction" | "completed"; notes?: string; due?: number | null },
): Promise<GoogleTaskItem> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.notes !== undefined) body.notes = updates.notes;
  if (updates.due !== undefined) body.due = updates.due ? new Date(updates.due).toISOString() : null;

  const res = await fetch(
    `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Google Tasks update failed: ${res.status}`);
  return toItem((await res.json()) as GoogleTask);
}

export async function deleteGoogleTask(
  accessToken: string,
  listId: string,
  taskId: string,
): Promise<void> {
  const res = await fetch(
    `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Tasks delete failed: ${res.status}`);
  }
}

function toItem(t: GoogleTask): GoogleTaskItem {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    notes: t.notes,
    due: t.due ? Date.parse(t.due) : null,
    updated: Date.parse(t.updated),
    completed: t.completed ? Date.parse(t.completed) : null,
  };
}
