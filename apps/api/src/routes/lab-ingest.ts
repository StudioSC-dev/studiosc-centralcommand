import { Hono } from "hono";
import {
  LAB_SCHEMA_VERSION,
  isLabSectionError,
  type LabSectionResult,
  type LabSections,
} from "@central-command/types";
import { sanitiseText } from "@central-command/utils";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { fail, ok } from "../lib/response";
import { bodyCap, labSourceAuth } from "../middleware/lab-source";
import { touchLabSource, upsertSnapshot } from "../services/lab";
import {
  NOTIFICATION_BATCH_MAX,
  appendNotifications,
  type NotificationInput,
} from "../services/notifications";

/**
 * The two endpoints the homelab agent pushes to.
 *
 * Mounted OUTSIDE the session guard in `index.ts`, alongside the Google Calendar
 * webhook, because the caller is a container on a LAN with no cookie. They
 * authenticate with a per-source bearer token instead (`labSourceAuth`).
 *
 * **Status codes here are part of the contract**, not an implementation detail.
 * The agent is ours and branches on them: 400 means "log loudly, this is a bug";
 * 401 means "stop pushing and page me"; 429 and 5xx mean "back off"; 413 means
 * "drop this one". Returning a generic 500 for everything would leave the agent
 * unable to tell a bug from a network event.
 */

/** Body caps. A snapshot is a few KB for 29 monitors; a full event batch, more. */
const SNAPSHOT_BODY_MAX = 64 * 1024;
const EVENTS_BODY_MAX = 128 * 1024;

/**
 * Topics we will accept events from — **an allowlist, in the consumer**.
 *
 * This is where the `lab-media` exclusion is actually enforced (D7). It could
 * have lived in the agent's config, but then a misconfigured or mis-deployed
 * agent could start shipping the names of films and episodes into a dashboard
 * that is scheduled to be opened to portfolio visitors. Event *text* leaks far
 * more than monitor counts do, so the rule belongs on the side that cannot be
 * changed by editing a container.
 */
const ALLOWED_TOPICS = new Set(["lab-alerts"]);

/** Parse an ISO timestamp; `null` on anything that is not one. */
function isoToEpoch(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Validate one section envelope.
 *
 * **A bare `null` is a 400.** A null section is ambiguous between "nothing to
 * report" and "the collector failed", and that ambiguity is the exact
 * silence-looks-like-health failure this whole integration exists to fix. The
 * card has to be able to say *"Kuma unreachable"* rather than render an empty
 * list that reads as "all clear", and it can only do that if the producer is
 * forced to say which one it meant.
 */
function readSection(value: unknown, name: string): LabSectionResult<unknown> | { error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: `sections.${name} must be {ok:true,data} or {ok:false,error}.` };
  }

  const section = value as { ok?: unknown; data?: unknown; error?: unknown };
  if (section.ok === true) {
    if (typeof section.data !== "object" || section.data === null) {
      return { error: `sections.${name}.data must be an object when ok is true.` };
    }
    return { ok: true, data: section.data };
  }
  if (section.ok === false) {
    if (!isLabSectionError(section.error)) {
      return {
        error: `sections.${name}.error must be one of unreachable|auth|timeout|unexpected_shape.`,
      };
    }
    return { ok: false, error: section.error };
  }
  return { error: `sections.${name}.ok must be a boolean.` };
}

const SECTION_NAMES = ["monitors", "backups", "images", "containers"] as const;

export const labIngest = new Hono<AppEnv>()
  .use("*", bodyCap(SNAPSHOT_BODY_MAX))
  .use("*", labSourceAuth)
  .post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, "bad_payload", "Body must be JSON.", 400);
    }

    if (typeof body !== "object" || body === null) {
      return fail(c, "bad_payload", "Body must be a JSON object.", 400);
    }
    const payload = body as Record<string, unknown>;

    if (payload.version !== LAB_SCHEMA_VERSION) {
      return fail(c, "bad_payload", `Unsupported payload version.`, 400);
    }

    const capturedAt = isoToEpoch(payload.capturedAt);
    if (capturedAt === null) {
      return fail(c, "bad_payload", "capturedAt must be an ISO 8601 timestamp.", 400);
    }

    if (typeof payload.sections !== "object" || payload.sections === null) {
      return fail(c, "bad_payload", "sections is required.", 400);
    }
    const raw = payload.sections as Record<string, unknown>;

    const sections: Record<string, LabSectionResult<unknown>> = {};
    for (const name of SECTION_NAMES) {
      const parsed = readSection(raw[name], name);
      if ("error" in parsed && !("ok" in parsed)) {
        return fail(c, "bad_payload", parsed.error, 400);
      }
      sections[name] = parsed as LabSectionResult<unknown>;
    }

    const agentVersion =
      typeof payload.agent === "object" && payload.agent !== null
        ? sanitiseText((payload.agent as { version?: unknown }).version, 40) || undefined
        : undefined;

    const result = await upsertSnapshot(createDb(c.env.DB), c.get("labSourceId"), {
      version: LAB_SCHEMA_VERSION,
      capturedAt,
      sections: sections as unknown as LabSections,
      agentVersion,
    });

    if (!result.accepted) {
      c.header("Retry-After", String(result.retryAfterSec));
      return fail(c, "rate_limited", "Pushing faster than the accepted cadence.", 429);
    }

    // 204: the agent has nothing to do with a body, and a snapshot push happens
    // 1,440 times a day per source.
    return c.body(null, 204);
  });

export const labEvents = new Hono<AppEnv>()
  .use("*", bodyCap(EVENTS_BODY_MAX))
  .use("*", labSourceAuth)
  .post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, "bad_payload", "Body must be JSON.", 400);
    }

    const payload = body as { version?: unknown; events?: unknown };
    if (payload.version !== LAB_SCHEMA_VERSION) {
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

      if (typeof event.ntfyId !== "string" || event.ntfyId.length === 0) {
        return fail(c, "bad_payload", "Each event needs an ntfyId (the dedup key).", 400);
      }
      if (typeof event.topic !== "string" || !ALLOWED_TOPICS.has(event.topic)) {
        // Deliberately specific: this one IS a producer bug worth naming, and
        // the token already proved who is calling.
        return fail(c, "bad_payload", "Topic is not on the accepted allowlist.", 400);
      }

      const publishedAt = isoToEpoch(event.publishedAt);
      if (publishedAt === null) {
        return fail(c, "bad_payload", "publishedAt must be an ISO 8601 timestamp.", 400);
      }

      inputs.push({
        source: "lab",
        kind: "alert",
        externalId: event.ntfyId,
        title: typeof event.title === "string" ? event.title : "Homelab alert",
        body: typeof event.message === "string" ? event.message : null,
        priority: typeof event.priority === "number" ? event.priority : 3,
        tags: event.tags,
        publishedAt,
      });
    }

    const db = createDb(c.env.DB);
    const result = await appendNotifications(
      db,
      c.get("userId"),
      c.get("labSourceLabel"),
      inputs,
    );
    // Events prove the lab is alive just as much as a snapshot does.
    await touchLabSource(db, c.get("labSourceId"));

    // A body here, unlike the snapshot path: the split lets the agent log its own
    // replay behaviour and notice if its `since=` cursor has stopped advancing.
    return ok(c, result);
  });
