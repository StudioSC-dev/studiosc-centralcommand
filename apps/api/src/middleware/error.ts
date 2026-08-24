import type { Context } from "hono";
import type { AppEnv } from "../env";
import { fail } from "../lib/response";

/**
 * Central error handler — converts thrown errors into the error envelope.
 *
 * The client message stays generic in production (an internal error message can
 * leak stack frames, SQL, or upstream credentials), but the *server* log must
 * name the throwing line. A bare `console.error(err)` in workerd prints the
 * message without the stack, which is how a `D1_ERROR` (Session 38) and a
 * Google `invalid_grant` (Session 41) each burned a full session presenting
 * only as "An unexpected error occurred."
 *
 * In local dev — identified by `DEV_AUTH_EMAIL`, the project's canonical dev
 * marker (see middleware/security.ts) — the real message is also returned to
 * the client, so a failure is legible in the browser without tailing wrangler.
 */
export function onError(err: Error, c: Context<AppEnv>) {
  const detail = describe(err);
  console.error(
    `[api] unhandled error: ${c.req.method} ${new URL(c.req.url).pathname} → ${detail}`,
  );
  if (err.stack) console.error(err.stack);
  if (err.cause) console.error("[api] caused by:", describe(err.cause));

  const isDev = Boolean(c.env.DEV_AUTH_EMAIL);
  return fail(
    c,
    "internal_error",
    isDev ? detail : "An unexpected error occurred.",
    500,
  );
}

/** `Name: message` for an unknown thrown value, without assuming it's an Error. */
function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** Fallback 404 handler in the error envelope shape. */
export function notFound(c: Context<AppEnv>) {
  return fail(c, "not_found", "Route not found.", 404);
}
