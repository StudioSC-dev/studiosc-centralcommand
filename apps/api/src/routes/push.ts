import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { savePushSubscription, removePushSubscription } from "../services/push";

export const push = new Hono<AppEnv>()
  .post("/subscribe", async (c) => {
    const body = await c.req
      .json<{ endpoint?: unknown; keys?: unknown }>()
      .catch(() => null);
    if (
      !body ||
      typeof body.endpoint !== "string" ||
      !body.endpoint.startsWith("https://") ||
      typeof body.keys !== "object" ||
      body.keys === null
    ) {
      return fail(c, "bad_request", "Invalid push subscription.", 400);
    }

    const keys = body.keys as Record<string, unknown>;
    if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
      return fail(c, "bad_request", "Missing p256dh or auth keys.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await savePushSubscription(db, userId, {
      endpoint: body.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });

    return ok(c, { subscribed: true });
  })
  .post("/unsubscribe", async (c) => {
    const body = await c.req
      .json<{ endpoint?: unknown }>()
      .catch(() => null);
    if (!body || typeof body.endpoint !== "string") {
      return fail(c, "bad_request", "Missing endpoint.", 400);
    }

    const db = createDb(c.env.DB);
    const userId = c.get("userId");
    await removePushSubscription(db, userId, body.endpoint);

    return ok(c, { subscribed: false });
  })
  .get("/vapid-key", async (c) => {
    return ok(c, { publicKey: c.env.VAPID_PUBLIC_KEY ?? null });
  });
