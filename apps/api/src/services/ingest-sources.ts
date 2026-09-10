import { and, eq } from "drizzle-orm";
import { ingestSources } from "@central-command/db";
import { sanitiseText } from "@central-command/utils";
import type { IngestSourceSecret } from "@central-command/types";
import type { Database } from "../lib/db";
import { newBearerToken, sha256Hex } from "../lib/crypto";
import { newId } from "../lib/ids";

/**
 * Shared push-ingest credentials — `ingest_sources` (../../integrations/trailhead-inbox.md D7).
 *
 * `lab_sources` is deliberately NOT generalised onto this table (see the
 * `services/lab.ts` header). Trailhead is this table's first producer; a third
 * one is a row plus an adapter file, not a migration.
 */

/** The spine sources a push credential may be minted for. */
export const INGEST_SOURCES = ["trailhead"] as const;
export type IngestSourceName = (typeof INGEST_SOURCES)[number];
export type IngestSourceRow = typeof ingestSources.$inferSelect;

/**
 * Mint and return the plaintext — ONCE. `null` when a credential for this
 * `(user, source)` already exists, so the route can answer 409 instead of
 * leaking the unique-constraint error as a 500.
 */
export async function createIngestSource(
  db: Database,
  userId: string,
  source: IngestSourceName,
  label: string,
): Promise<IngestSourceSecret | null> {
  const token = newBearerToken("cct");
  const id = newId();

  const inserted = await db
    .insert(ingestSources)
    .values({
      id,
      userId,
      source,
      label: sanitiseText(label, 60) || "Trailhead",
      tokenHash: await sha256Hex(token),
      createdAt: Date.now(),
      rotatedAt: null,
      lastSeenAt: null,
    })
    .onConflictDoNothing()
    .returning({ id: ingestSources.id, label: ingestSources.label });

  const row = inserted[0];
  if (!row) return null;
  return { id: row.id, source, label: row.label, token };
}

/** New token for an existing `(user, source)`; invalidates the old one. */
export async function rotateIngestToken(
  db: Database,
  userId: string,
  source: IngestSourceName,
): Promise<IngestSourceSecret | null> {
  const token = newBearerToken("cct");
  const updated = await db
    .update(ingestSources)
    .set({ tokenHash: await sha256Hex(token), rotatedAt: Date.now() })
    .where(and(eq(ingestSources.userId, userId), eq(ingestSources.source, source)))
    .returning({ id: ingestSources.id, label: ingestSources.label });

  const row = updated[0];
  if (!row) return null;
  return { id: row.id, source, label: row.label, token };
}

/**
 * Revoke = row delete. Leaves spine rows alone: the `notification_sources`
 * badge and any unread rows stay put, exactly like lab today (the generic
 * `DELETE /api/notifications/sources/:source` already exists for the badge).
 */
export async function deleteIngestSource(
  db: Database,
  userId: string,
  source: IngestSourceName,
): Promise<boolean> {
  const deleted = await db
    .delete(ingestSources)
    .where(and(eq(ingestSources.userId, userId), eq(ingestSources.source, source)))
    .returning({ id: ingestSources.id });
  return deleted.length > 0;
}

export async function listIngestSources(db: Database, userId: string): Promise<IngestSourceRow[]> {
  return db.select().from(ingestSources).where(eq(ingestSources.userId, userId));
}

/**
 * Resolve a presented bearer token to its source row, hash-then-lookup like
 * `sourceForToken` in `services/lab.ts`, then refuse a token minted for a
 * different source — the check that closes cross-endpoint token reuse.
 *
 * Returns `null` either way (unknown token, or a token for a different
 * source) so the caller can emit the same 401 body and this cannot become an
 * oracle for which sources exist.
 */
export async function ingestSourceForToken(
  db: Database,
  token: string,
  expected: IngestSourceName,
): Promise<IngestSourceRow | null> {
  const hash = await sha256Hex(token);
  const row = await db.select().from(ingestSources).where(eq(ingestSources.tokenHash, hash)).get();
  if (!row || row.source !== expected) return null;
  return row;
}

/** Bump `last_seen_at`. Operator signal only — never a freshness input (D6). */
export async function touchIngestSource(db: Database, id: string): Promise<void> {
  await db.update(ingestSources).set({ lastSeenAt: Date.now() }).where(eq(ingestSources.id, id));
}
