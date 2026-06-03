import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { tasks } from "@central-command/db";
import type {
  Task,
  TaskCreateInput,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
} from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { newId } from "../lib/ids";

const PRIORITIES: TaskPriority[] = ["high", "med", "low"];
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 };

const isPriority = (v: unknown): v is TaskPriority =>
  typeof v === "string" && (PRIORITIES as string[]).includes(v);

type TaskRow = typeof tasks.$inferSelect;
const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  priority: r.priority as TaskPriority,
  status: r.status as TaskStatus,
  position: r.position,
  source: r.source as Task["source"],
  deadline: r.deadline ?? null,
  createdAt: r.createdAt,
  completedAt: r.completedAt ?? null,
});

/**
 * Open tasks first, ordered by importance (priority) then urgency (soonest deadline,
 * undated last), then manual order — the Eisenhower lens. Completed tasks by recency.
 */
function sortTasks(rows: TaskRow[]): Task[] {
  return rows.map(toTask).sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.status === "open") {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      const d = (a.deadline ?? Infinity) - (b.deadline ?? Infinity);
      if (d !== 0) return d;
      if (a.position !== b.position) return a.position - b.position;
      return a.createdAt - b.createdAt;
    }
    return (b.completedAt ?? 0) - (a.completedAt ?? 0);
  });
}

/** Tasks pillar — native "current priorities" CRUD. */
export const tasks_routes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(tasks)
      .where(eq(tasks.userId, c.get("userId")))
      .all();
    return ok(c, { tasks: sortTasks(rows) });
  })
  .post("/", async (c) => {
    const body = await c.req.json<TaskCreateInput>().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return fail(c, "bad_request", "A task title is required.", 400);

    const db = createDb(c.env.DB);
    const row = {
      id: newId(),
      userId: c.get("userId"),
      title,
      priority: isPriority(body?.priority) ? body!.priority : ("med" as TaskPriority),
      status: "open" as TaskStatus,
      position: Date.now(), // monotonic default order; explicit reordering overrides
      source: "native" as const,
      externalId: null,
      deadline: typeof body?.deadline === "number" ? body.deadline : null,
      createdAt: Date.now(),
      completedAt: null,
    };
    await db.insert(tasks).values(row);
    return ok(c, toTask(row), 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<TaskUpdateInput>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    const existing = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .get();
    if (!existing) return fail(c, "not_found", "Task not found.", 404);

    const patch: Partial<TaskRow> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (isPriority(body.priority)) patch.priority = body.priority;
    if (typeof body.position === "number") patch.position = body.position;
    if (typeof body.deadline === "number" || body.deadline === null) patch.deadline = body.deadline;
    if (body.status === "open" || body.status === "done") {
      patch.status = body.status;
      patch.completedAt = body.status === "done" ? Date.now() : null;
    }

    await db.update(tasks).set(patch).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return ok(c, toTask({ ...existing, ...patch }));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    await createDb(c.env.DB)
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return ok(c, { id });
  });
