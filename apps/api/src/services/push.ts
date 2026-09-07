import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@central-command/db";
import type { Database } from "../lib/db";
import { newId } from "../lib/ids";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(
  db: Database,
  userId: string,
  sub: PushSubscriptionInput,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      userId,
      endpoint: sub.endpoint,
      keysP256dh: sub.keys.p256dh,
      keysAuth: sub.keys.auth,
      createdAt: now,
    })
    .onConflictDoNothing();
}

export async function removePushSubscription(
  db: Database,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function getUserSubscriptions(
  db: Database,
  userId: string,
): Promise<{ endpoint: string; keysP256dh: string; keysAuth: string }[]> {
  return db
    .select({
      endpoint: pushSubscriptions.endpoint,
      keysP256dh: pushSubscriptions.keysP256dh,
      keysAuth: pushSubscriptions.keysAuth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .all();
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64Url: string,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 60 * 60, sub: subject };

  const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64Url);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  const sigBytes = new Uint8Array(sig);
  const sigB64 = uint8ArrayToBase64Url(sigBytes);
  return `${unsignedToken}.${sigB64}`;
}

export async function sendWebPush(
  subscription: { endpoint: string; keysP256dh: string; keysAuth: string },
  payload: { title: string; body: string; url?: string },
  env: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string },
): Promise<boolean> {
  try {
    const audience = new URL(subscription.endpoint).origin;
    const jwt = await createVapidJwt(audience, env.VAPID_SUBJECT, env.VAPID_PRIVATE_KEY);

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: JSON.stringify(payload),
    });

    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

export async function dispatchPushToUser(
  db: Database,
  userId: string,
  payload: { title: string; body: string; url?: string },
  env: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string },
): Promise<void> {
  const subs = await getUserSubscriptions(db, userId);
  await Promise.allSettled(
    subs.map((sub) => sendWebPush(sub, payload, env)),
  );
}
