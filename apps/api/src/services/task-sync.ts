import { and, eq } from "drizzle-orm";
import { tasks } from "@central-command/db";
import type { Bindings } from "../env";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";
import { getFirstValidToken } from "./google-accounts";
import {
  createGoogleTask,
  deleteGoogleTask,
  fetchTaskLists,
  fetchTasks,
  updateGoogleTask,
} from "./google-tasks";

const SYNC_GATE_TTL = 15 * 60;

async function getDefaultListId(accessToken: string): Promise<string | null> {
  const lists = await fetchTaskLists(accessToken);
  return lists[0]?.id ?? null;
}

export async function pullGoogleTasks(
  db: Database,
  env: Bindings,
  userId: string,
): Promise<{ pulled: number; skipped: number }> {
  const cred = await getFirstValidToken(db, env, userId);
  if (!cred) return { pulled: 0, skipped: 0 };

  const listId = await getDefaultListId(cred.token);
  if (!listId) return { pulled: 0, skipped: 0 };

  const remote = await fetchTasks(cred.token, listId);
  let pulled = 0;
  let skipped = 0;

  for (const gt of remote) {
    const existing = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.source, "google_tasks"), eq(tasks.externalId, gt.id)))
      .get();

    if (existing) {
      const localUpdated = existing.updatedAt ?? existing.createdAt;
      if (localUpdated >= gt.updated) {
        skipped++;
        continue;
      }
      const status = gt.status === "completed" ? "done" : "open";
      await db
        .update(tasks)
        .set({
          title: gt.title,
          status,
          deadline: gt.due,
          updatedAt: gt.updated,
          completedAt: gt.completed,
        })
        .where(eq(tasks.id, existing.id));
      pulled++;
    } else {
      await db.insert(tasks).values({
        id: newId(),
        userId,
        title: gt.title,
        priority: "med",
        status: gt.status === "completed" ? "done" : "open",
        position: Date.now(),
        source: "google_tasks",
        externalId: gt.id,
        deadline: gt.due,
        createdAt: Date.now(),
        updatedAt: gt.updated,
        completedAt: gt.completed,
      });
      pulled++;
    }
  }

  return { pulled, skipped };
}

export async function pushTaskToGoogle(
  db: Database,
  env: Bindings,
  userId: string,
  taskId: string,
  action: "create" | "update" | "delete",
): Promise<void> {
  const cred = await getFirstValidToken(db, env, userId);
  if (!cred) return;

  const listId = await getDefaultListId(cred.token);
  if (!listId) return;

  if (action === "delete") {
    const row = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .get();
    if (row?.externalId && row.source === "google_tasks") {
      await deleteGoogleTask(cred.token, listId, row.externalId).catch(() => {});
    }
    return;
  }

  const row = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .get();
  if (!row) return;

  if (action === "create" && row.source === "native") {
    const created = await createGoogleTask(cred.token, listId, {
      title: row.title,
      due: row.deadline ?? undefined,
    });
    await db
      .update(tasks)
      .set({ source: "google_tasks", externalId: created.id })
      .where(eq(tasks.id, taskId));
    return;
  }

  if (action === "update" && row.externalId) {
    await updateGoogleTask(cred.token, listId, row.externalId, {
      title: row.title,
      status: row.status === "done" ? "completed" : "needsAction",
      due: row.deadline,
    }).catch(() => {});
  }
}

export async function syncTasks(
  db: Database,
  env: Bindings,
  userId: string,
): Promise<{ pulled: number; skipped: number }> {
  return pullGoogleTasks(db, env, userId);
}

export async function shouldSync(
  env: Bindings,
  userId: string,
): Promise<boolean> {
  const key = `task-sync:${userId}`;
  const last = await env.CACHE.get(key);
  if (last) return false;
  await env.CACHE.put(key, "1", { expirationTtl: SYNC_GATE_TTL });
  return true;
}
