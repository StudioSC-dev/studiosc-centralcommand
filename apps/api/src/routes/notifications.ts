import { Hono } from "hono";
import { isNotificationStatus } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail, ok } from "../lib/response";
import {
  deleteSource,
  markAllRead,
  readNotifications,
  renameSource,
  setNotificationStatus,
} from "../services/notifications";

/**
 * The notifications card's API.
 *
 * One read and two writes, which is the whole of "slot 1" of the Zero Inbox
 * build order: spine + route + card. The collectors that will fill it (Gmail,
 * Slack, Linear) and the delivery channels that will drain it (web push, native
 * toasts from the Tauri shell) are later slots and are deliberately absent —
 * but nothing here assumes the lab is the only producer, which is the property
 * that has to hold now rather than later.
 *
 * Writes need no demo handling: `demoReadOnly` blocks every non-GET first.
 */
export const notificationRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    return ok(c, await readNotifications(createDb(c.env.DB), c.get("userId")));
  })

  .patch("/:id", async (c) => {
    const body = await c.req
      .json<{ status?: unknown; snoozeUntil?: unknown }>()
      .catch(() => ({}) as { status?: unknown; snoozeUntil?: unknown });

    if (!isNotificationStatus(body.status)) {
      return fail(c, "bad_request", "status must be unread, read, or dismissed.", 400);
    }
    // Accepted and stored, with no UI behind it yet. The column exists because
    // snooze is in the recorded design and adding it later is a migration; the
    // route accepts it for the same reason.
    const snoozeUntil = typeof body.snoozeUntil === "number" ? body.snoozeUntil : null;

    const updated = await setNotificationStatus(
      createDb(c.env.DB),
      c.get("userId"),
      c.req.param("id"),
      body.status,
      snoozeUntil,
    );
    // Scoped by user in the WHERE clause, so an id belonging to another account
    // is indistinguishable from one that does not exist. That is the intent.
    if (!updated) return fail(c, "not_found", "No such notification.", 404);
    return ok(c, updated);
  })

  .patch("/sources/:source", async (c) => {
    const body = await c.req.json<{ label?: unknown }>().catch(() => ({}) as { label?: unknown });
    if (typeof body.label !== "string" || !body.label.trim()) {
      return fail(c, "bad_request", "label must be a non-empty string.", 400);
    }
    const updated = await renameSource(
      createDb(c.env.DB),
      c.get("userId"),
      c.req.param("source"),
      body.label,
    );
    if (!updated) return fail(c, "not_found", "No such source.", 404);
    return ok(c, { renamed: true });
  })

  .delete("/sources/:source", async (c) => {
    const deleted = await deleteSource(
      createDb(c.env.DB),
      c.get("userId"),
      c.req.param("source"),
    );
    if (!deleted) return fail(c, "not_found", "No such source.", 404);
    return ok(c, { deleted: true });
  })

  .post("/read-all", async (c) => {
    const body = await c.req.json<{ source?: unknown }>().catch(() => ({}) as { source?: unknown });
    const source = typeof body.source === "string" ? body.source : undefined;
    const count = await markAllRead(createDb(c.env.DB), c.get("userId"), source);
    return ok(c, { read: count });
  });
