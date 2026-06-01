import type { ApiResponse } from "@central-command/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

/**
 * Typed GET against the Central Command API. Unwraps the standard envelope and
 * throws on the error variant so TanStack Query can surface it.
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
