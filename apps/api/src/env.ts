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

  // Non-secret config (wrangler.toml [vars]). THE origin the browser uses to
  // reach this app — the single source of truth for every absolute URL we hand
  // out: the Google OAuth redirect URI, the post-callback redirect back to the
  // SPA, and the Calendar push webhook address.
  //
  // It must NOT be derived from the incoming request. `wrangler dev` simulates
  // the `[[routes]]` pattern, so the Worker sees the *production* hostname
  // locally while rewriting outbound `Location` headers back to localhost —
  // which silently desyncs the OAuth authorize and token-exchange legs.
  //
  // Prod: https://centralcommand.studiosc.dev (Pages at /, Worker at /api/*).
  // Dev:  http://localhost:5173 (Vite, which proxies /api to wrangler). Being
  // http:// and not public, it also self-disables the Calendar push webhook —
  // Google can't reach localhost — leaving the poll to keep data fresh.
  APP_ORIGIN: string;

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
