/**
 * Public entrypoint for the database package.
 *
 * Exports the Drizzle schema (tables + inferred types). The Drizzle client
 * itself is constructed in `apps/api`, which binds it to the D1 instance from
 * the Worker environment.
 */
export * as schema from "./schema";
export * from "./schema";
