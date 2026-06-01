import { drizzle } from "drizzle-orm/d1";
import { schema } from "@central-command/db";

/** Construct a Drizzle client bound to the request's D1 instance. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
