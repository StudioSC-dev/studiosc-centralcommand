import { v7 as uuidv7 } from "uuid";

/**
 * Generate a UUID v7 — time-sortable, used as the canonical primary key for
 * users and all row ids. Single import point so the id strategy lives in one
 * place.
 */
export function newId(): string {
  return uuidv7();
}
