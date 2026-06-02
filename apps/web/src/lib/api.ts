import type { ApiResponse } from "@central-command/types";

// Same-origin by default: prod serves the API at /api/* on the same host, and
// the Vite dev server proxies /api to the local Worker (see vite.config.ts).
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Typed GET against the Central Command API. Unwraps the standard envelope and
 * throws on the error variant so TanStack Query can surface it. Paths are
 * absolute from the API root, e.g. `apiGet("/api/weather")`.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(body.error.message);
  }
  return body.data;
}

/** Typed POST with a JSON body. Unwraps the envelope, throws on the error variant. */
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(body.error.message);
  }
  return body.data;
}
