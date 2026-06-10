/**
 * Public read-only demo identity. A single seeded user that every anonymous
 * "View demo" visitor shares (read-only — the demo guard blocks all writes, and
 * weather/calendar are served from fixtures), so there's no shared mutable state
 * and no exposure of the third-party API keys.
 *
 * IMPORTANT: `DEMO_USER_ID` / `DEMO_EMAIL` must stay in sync with the literals in
 * `packages/db/seed-demo.sql`, which seeds this user's rows.
 */
export const DEMO_USER_ID = "demo0000-0000-7000-8000-000000000000";
export const DEMO_EMAIL = "demo@centralcommand.studiosc.dev";
