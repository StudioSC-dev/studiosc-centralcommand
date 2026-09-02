import { and, desc, eq, gte } from "drizzle-orm";
import { focusSessions } from "@central-command/db";
import type { FocusSession, FocusSessionInput } from "@central-command/types";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

function toSession(row: typeof focusSessions.$inferSelect): FocusSession {
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    duration: row.duration,
    completed: row.completed === 1,
    createdAt: row.createdAt,
  };
}

/** Today's focus sessions and cumulative completed time. */
export async function getTodaySessions(
  db: Database,
  userId: string,
  todayStart: number,
): Promise<{ sessions: FocusSession[]; todayTotal: number }> {
  const rows = await db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), gte(focusSessions.startedAt, todayStart)))
    .orderBy(desc(focusSessions.startedAt));

  const sessions = rows.map(toSession);
  const todayTotal = sessions
    .filter((s) => s.completed)
    .reduce((sum, s) => sum + s.duration, 0);

  return { sessions, todayTotal };
}

/** Record a completed or abandoned focus session. */
export async function createSession(
  db: Database,
  userId: string,
  input: FocusSessionInput,
): Promise<FocusSession> {
  const now = Date.now();
  const row = {
    id: newId(),
    userId,
    startedAt: input.startedAt,
    duration: input.duration,
    completed: input.completed ? 1 : 0,
    createdAt: now,
  };
  await db.insert(focusSessions).values(row);
  return toSession({ ...row, completed: row.completed });
}
