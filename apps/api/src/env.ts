/**
 * Worker environment bindings and per-request Hono variables.
 *
 * Bindings are declared in `wrangler.toml` (D1, KV) or provided as Worker
 * secrets / `.dev.vars` (the string values). Keep this in sync with both.
 */
export interface Bindings {
  // Resource bindings (wrangler.toml)
  DB: D1Database;
  CACHE: KVNamespace;

  // Non-secret config vars (wrangler.toml [vars])
  CF_ACCESS_AUD: string;
  CF_ACCESS_TEAM_DOMAIN: string;

  // Secrets
  API_BEARER_TOKEN: string;
  OPENWEATHERMAP_API_KEY: string;
  RIOT_API_KEY: string;
  RIOT_DEV_RIOT_ID: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  /** HMAC key (base64 of 32 bytes) for signing app session JWTs. */
  SESSION_SECRET: string;

  // Local dev only — never set in production. When present and no Access JWT
  // is provided, the auth middleware treats this email as the verified identity.
  DEV_AUTH_EMAIL?: string;
}

/** Values attached to the Hono context during a request. */
export interface Variables {
  /** Authenticated user id (UUID v7), resolved by auth middleware. */
  userId: string;
  /** Authenticated user email. */
  userEmail: string;
  /** True for the public read-only demo session (blocks writes / third-party calls). */
  isDemo: boolean;
}

/** Hono generics for the whole app. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
