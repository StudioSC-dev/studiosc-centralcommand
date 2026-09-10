import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail, ok } from "../lib/response";
import { bodyCap } from "../middleware/lab-source";
import { ingestSourceAuth } from "../middleware/ingest-source";
import { touchIngestSource } from "../services/ingest-sources";
import {
  NOTIFICATION_BATCH_MAX,
  appendNotifications,
  type NotificationInput,
} from "../services/notifications";

/**
 * `POST /api/trailhead/events` — Trailhead's notifier push endpoint.
 *
 * Mounted OUTSIDE the session guard in `index.ts`, alongside the lab ingest
 * routes: the notifier has no cookie and authenticates with its own per-source
 * bearer token (`ingestSourceAuth("trailhead")`) instead.
 *
 * Structured exactly like `labEvents` in `routes/lab-ingest.ts`. Status codes
 * here are part of the contract, same as lab: 400 is a producer bug, 401 means
 * stop pushing, 413 means drop this one.
 */

export const TRAILHEAD_SCHEMA_VERSION = 1;
/** Same cap as the lab event path. */
const EVENTS_BODY_MAX = 128 * 1024;
/** Only these schemes may render as a deep link; anything else is dropped. */
const LINK_SCHEMES = new Set(["https:", "http:"]);

/** Parse an ISO timestamp; `null` on anything that is not one. */
function isoToEpoch(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Keep `link` only when it parses as an absolute URL with an HTTP(S) scheme.
 * Anything else becomes `null` and is logged once — dropping a bad link keeps
 * the notification (a 400 would wedge the producer's replay cursor), and the
 * warning keeps the producer bug discoverable. This is the load-bearing check
 * for the link ever becoming a clickable, renderable value later.
 */
function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (!LINK_SCHEMES.has(url.protocol)) {
      console.warn(`[trailhead] dropped event link with unsafe scheme ${url.protocol}`);
      return null;
    }
    return value;
  } catch {
    console.warn("[trailhead] dropped event link that does not parse as a URL");
    return null;
  }
}

export const trailheadEvents = new Hono<AppEnv>()
  .use("*", bodyCap(EVENTS_BODY_MAX))
  .use("*", ingestSourceAuth("trailhead"))
  .post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, "bad_payload", "Body must be JSON.", 400);
    }

    if (typeof body !== "object" || body === null) {
      return fail(c, "bad_payload", "Body must be JSON.", 400);
    }
    const payload = body as { version?: unknown; events?: unknown };

    if (payload.version !== TRAILHEAD_SCHEMA_VERSION) {
      return fail(c, "bad_payload", "Unsupported payload version.", 400);
    }
    if (!Array.isArray(payload.events)) {
      return fail(c, "bad_payload", "events must be an array.", 400);
    }
    if (payload.events.length > NOTIFICATION_BATCH_MAX) {
      return fail(c, "bad_payload", `At most ${NOTIFICATION_BATCH_MAX} events per batch.`, 400);
    }

    const inputs: NotificationInput[] = [];
    for (const raw of payload.events) {
      if (typeof raw !== "object" || raw === null) {
        return fail(c, "bad_payload", "Each event must be an object.", 400);
      }
      const event = raw as Record<string, unknown>;

      if (typeof event.eventId !== "string" || event.eventId.length === 0) {
        return fail(c, "bad_payload", "Each event needs an eventId (the dedup key).", 400);
      }
      if (typeof event.type !== "string" || event.type.length === 0) {
        return fail(c, "bad_payload", "Each event needs a type.", 400);
      }

      const occurredAt = isoToEpoch(event.occurredAt);
      if (occurredAt === null) {
        return fail(c, "bad_payload", "occurredAt must be an ISO 8601 timestamp.", 400);
      }

      inputs.push({
        source: "trailhead", // forced here, never taken from the payload
        kind: event.type,
        externalId: event.eventId,
        title: typeof event.title === "string" ? event.title : "",
        body: typeof event.body === "string" ? event.body : null,
        link: safeLink(event.link),
        priority: typeof event.priority === "number" ? event.priority : 3,
        tags: event.tags,
        publishedAt: occurredAt,
      });
    }

    const db = createDb(c.env.DB);
    const result = await appendNotifications(db, c.get("userId"), c.get("ingestSourceLabel"), inputs);
    // Events prove the producer is alive just as much as any other push would.
    await touchIngestSource(db, c.get("ingestSourceId"));

    return ok(c, result);
  });
