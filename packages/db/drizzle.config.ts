import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the Central Command D1 database.
 *
 * `generate` emits SQL migrations from `schema.ts` into `migrations/`.
 * Migrations are applied to D1 with:
 *   wrangler d1 migrations apply central-command-db
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./schema.ts",
  out: "./migrations",
});
