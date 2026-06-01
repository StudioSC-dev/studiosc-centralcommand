import type { Context } from "hono";
import type { ApiError, ApiSuccess } from "@central-command/types";

/** Wrap data in the standard success envelope and return JSON. */
export function ok<T>(c: Context, data: T, status = 200) {
  const body: ApiSuccess<T> = { ok: true, data };
  return c.json(body, status as 200);
}

/** Wrap an error in the standard error envelope and return JSON. */
export function fail(c: Context, code: string, message: string, status = 400) {
  const body: ApiError = { ok: false, error: { code, message } };
  return c.json(body, status as 400);
}
