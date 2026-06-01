import type { Context } from "hono";
import type { AppEnv } from "../env";
import { fail } from "../lib/response";

/** Central error handler — converts thrown errors into the error envelope. */
export function onError(err: Error, c: Context<AppEnv>) {
  console.error("[api] unhandled error:", err);
  return fail(c, "internal_error", "An unexpected error occurred.", 500);
}

/** Fallback 404 handler in the error envelope shape. */
export function notFound(c: Context<AppEnv>) {
  return fail(c, "not_found", "Route not found.", 404);
}
