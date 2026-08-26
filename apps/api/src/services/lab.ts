import { eq } from "drizzle-orm";
import { labSnapshots, labSources } from "@central-command/db";
import { sanitiseText } from "@central-command/utils";
import {
  labFreshness,
  type LabResponse,
  type LabSections,
  type LabSourceSecret,
} from "@central-command/types";
import type { Database } from "../lib/db";
import { newBearerToken, sha256Hex } from "../lib/crypto";
import { newId } from "../lib/ids";
import { recentFromSource } from "./notifications";

/**
 * Homelab telemetry — sources, tokens, and the latest snapshot.
 *
 * Contract: ../integrations/homelab-telemetry.md. The lab PUSHES and the cloud
 * never reaches in (D2): a Worker cannot join a tailnet, and opening a tunnel
 * into the LAN to solve a freshness problem that a 60s push already solves would
 * be the wrong trade by a wide margin.
 */

/** Minimum gap between accepted pushes, per source. */
export const INGEST_MIN_GAP_MS = 20_000;
/** How many lab notifications the card gets for its green-state filler. */
const LAB_EVENT_PREVIEW = 20;

export type LabSourceRow = typeof labSources.$inferSelect;

/**
 * Mint a source and return its token — **once**.
 *
 * Only the hash is stored, so this return value is the single moment the
 * plaintext exists anywhere we control. If it is lost, the answer is rotation,
 * not recovery, and that is deliberate (risk 4).
 */
export async function createLabSource(
  db: Database,
  userId: string,
  label: string,
): Promise<LabSourceSecret> {
  const token = newBearerToken();
  const id = newId();

  await db.insert(labSources).values({
    id,
    userId,
    label: sanitiseText(label, 60) || "Homelab",
    tokenHash: await sha256Hex(token),
    createdAt: Date.now(),
    rotatedAt: null,
    lastSeenAt: null,
    agentVersion: null,
  });

  return { id, label, token };
}

/**
 * Issue a new token for an existing source, invalidating the old one.
 *
 * A first-class operation rather than "delete and re-create" because the source
 * id is what the snapshot hangs off — re-creating would orphan the last known
 * state and make a routine credential rotation look like the lab vanished.
 */
export async function rotateLabToken(
  db: Database,
  userId: string,
  id: string,
): Promise<LabSourceSecret | null> {
  const token = newBearerToken();
  const updated = await db
    .update(labSources)
    .set({ tokenHash: await sha256Hex(token), rotatedAt: Date.now() })
    .where(eq(labSources.id, id))
    .returning();

  const row = updated[0];
  // Ownership checked after the fact rather than in the WHERE clause so this
  // reads the same as every other user-scoped write. A mismatch cannot happen
  // without an id from another account, which the route already refuses.
  if (!row || row.userId !== userId) return null;
  return { id: row.id, label: row.label, token };
}

export async function deleteLabSource(db: Database, userId: string, id: string): Promise<boolean> {
  const source = await db.select().from(labSources).where(eq(labSources.id, id)).get();
  if (!source || source.userId !== userId) return false;
  // Snapshot first: it references the source.
  await db.delete(labSnapshots).where(eq(labSnapshots.sourceId, id));
  await db.delete(labSources).where(eq(labSources.id, id));
  return true;
}

export async function listLabSources(db: Database, userId: string): Promise<LabSourceRow[]> {
  return db.select().from(labSources).where(eq(labSources.userId, userId));
}

/**
 * Resolve a presented bearer token to its source.
 *
 * Hash, then look up on the unique index. No secret is compared byte-by-byte in
 * app code, so there is no timing side channel to get wrong, and an unknown
 * token costs exactly one indexed miss.
 */
export async function sourceForToken(db: Database, token: string): Promise<LabSourceRow | null> {
  const hash = await sha256Hex(token);
  const row = await db.select().from(labSources).where(eq(labSources.tokenHash, hash)).get();
  return row ?? null;
}

/** The source belonging to a user, if they have connected one. */
export async function labSourceForUser(db: Database, userId: string): Promise<LabSourceRow | null> {
  const row = await db.select().from(labSources).where(eq(labSources.userId, userId)).get();
  return row ?? null;
}

/**
 * Store a snapshot, latest-only.
 *
 * One row per source, upserted — not appended (risk 3). At a 60s cadence an
 * append would be 1,440 rows/day/source of history nobody has asked for, and
 * there is no sparkline to justify it yet.
 *
 * The cadence floor is enforced here rather than in KV, and that is the whole
 * point: a KV counter on this path would write on **every** request, which is
 * ~1,440 writes/day against a 1,000/day free allowance — the exact bug removed
 * in Session 44. The existing row is already being read to perform the upsert,
 * so checking its `received_at` costs nothing at all. Abuse of the endpoint
 * itself is a WAF rule, in front of the Worker, with zero storage ops.
 */
export async function upsertSnapshot(
  db: Database,
  sourceId: string,
  payload: { version: number; capturedAt: number; sections: LabSections; agentVersion?: string },
): Promise<{ accepted: boolean; retryAfterSec: number }> {
  const now = Date.now();
  const existing = await db
    .select({ receivedAt: labSnapshots.receivedAt })
    .from(labSnapshots)
    .where(eq(labSnapshots.sourceId, sourceId))
    .get();

  if (existing && now - existing.receivedAt < INGEST_MIN_GAP_MS) {
    const waitMs = INGEST_MIN_GAP_MS - (now - existing.receivedAt);
    return { accepted: false, retryAfterSec: Math.ceil(waitMs / 1000) };
  }

  const row = {
    sourceId,
    version: payload.version,
    capturedAt: payload.capturedAt,
    receivedAt: now,
    sections: JSON.stringify(payload.sections),
    agentVersion: payload.agentVersion ?? null,
  };

  await db
    .insert(labSnapshots)
    .values(row)
    .onConflictDoUpdate({ target: labSnapshots.sourceId, set: row });

  // `last_seen_at` is the dead-man's switch and is bumped on EVERY accepted
  // push, snapshot or event — it answers "when did we last hear from the lab",
  // not "when did the lab last have something to say".
  await db
    .update(labSources)
    .set({ lastSeenAt: now, agentVersion: payload.agentVersion ?? null })
    .where(eq(labSources.id, sourceId));

  return { accepted: true, retryAfterSec: 0 };
}

/** Bump `last_seen_at` without touching the snapshot — used by the event path. */
export async function touchLabSource(db: Database, sourceId: string): Promise<void> {
  await db.update(labSources).set({ lastSeenAt: Date.now() }).where(eq(labSources.id, sourceId));
}

/**
 * The card's read.
 *
 * **Freshness is computed here, server-side, always** (risk 6). The client never
 * derives it: a stale snapshot rendered as current is precisely the
 * silence-looks-like-health failure this integration exists to fix, and leaving
 * that computation to the UI would put the safety property in the least
 * trustworthy place.
 *
 * Scoped by `userId`, which is also what makes D4 a real boundary — a demo
 * session resolves the demo user's fictional source and can reach no other.
 * Card visibility is a preference and is never a privacy control.
 */
export async function readLab(db: Database, userId: string): Promise<LabResponse> {
  const source = await labSourceForUser(db, userId);
  if (!source) return { source: null, snapshot: null, events: [] };

  const [snapshotRow, events] = await Promise.all([
    db.select().from(labSnapshots).where(eq(labSnapshots.sourceId, source.id)).get(),
    recentFromSource(db, userId, "lab", LAB_EVENT_PREVIEW),
  ]);

  let sections: LabSections | null = null;
  if (snapshotRow) {
    try {
      sections = JSON.parse(snapshotRow.sections) as LabSections;
    } catch {
      // A payload we cannot parse is a payload we do not have. The card renders
      // its offline state, which is honest, rather than a half-populated one.
      sections = null;
    }
  }

  return {
    source: {
      id: source.id,
      label: source.label,
      lastSeenAt: source.lastSeenAt,
      freshness: labFreshness(source.lastSeenAt, Date.now()),
      agentVersion: source.agentVersion,
    },
    snapshot:
      snapshotRow && sections
        ? {
            version: snapshotRow.version,
            capturedAt: snapshotRow.capturedAt,
            receivedAt: snapshotRow.receivedAt,
            sections,
          }
        : null,
    events,
  };
}
