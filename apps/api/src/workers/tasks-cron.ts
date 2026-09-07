import { isNotNull } from "drizzle-orm";
import { userSettings } from "@central-command/db";
import type { Bindings } from "../env";
import { createDb } from "../lib/db";
import { syncTasks, shouldSync } from "../services/task-sync";

export async function runTasksSync(env: Bindings): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(isNotNull(userSettings.googleAccounts))
    .all();

  for (const { userId } of rows) {
    if (!(await shouldSync(env, userId))) continue;
    try {
      await syncTasks(db, env, userId);
    } catch (err) {
      console.error(`[tasks-cron] sync failed for ${userId}:`, err);
    }
  }
}
