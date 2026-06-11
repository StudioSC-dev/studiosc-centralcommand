import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import type { Context } from "hono";
import type { AppEnv } from "../env";

/**
 * Security headers for every API response. The API only ever returns JSON or
 * redirects — never HTML — so the CSP is locked all the way down to
 * `default-src 'none'`: there are no scripts, styles, images, or frames to
 * allow. The browser-facing CSP for the SPA lives separately in the web app's
 * `_headers` file (Cloudflare Pages), where the real allow-list matters.
 *
 * HSTS and `upgrade-insecure-requests` are gated to production. WebKit/Safari
 * honor both even against http://localhost and will rewrite requests to https,
 * breaking local dev and any WebKit test runs.
 *
 * We can't detect production by hostname: with a `[[routes]]` pattern in
 * wrangler.toml, `wrangler dev` simulates the route and the Worker sees the
 * production hostname locally too. Instead we use `DEV_AUTH_EMAIL`, the
 * project's canonical local-dev marker — set only in `.dev.vars`, never in
 * production (see env.ts). Its absence means a deployed Worker. This is
 * safe-by-default: a functioning local dev always has it, so it never leaks
 * HSTS onto localhost.
 */

const HSTS = "max-age=31536000; includeSubDomains; preload";

/** Shared baseline — applied identically in every environment. */
const baseOptions = {
  // No HTML is served, so nothing legitimate needs loading. Lock it all down.
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    baseUri: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'none'"],
    objectSrc: ["'none'"],
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  // Deny powerful features outright — this API needs none of them.
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
  // Configured per-environment below.
  strictTransportSecurity: false as const,
} satisfies Parameters<typeof secureHeaders>[0];

// Two pre-built middlewares so the per-request branch is a cheap pointer pick.
const prodHeaders = secureHeaders({
  ...baseOptions,
  strictTransportSecurity: HSTS,
  contentSecurityPolicy: {
    ...baseOptions.contentSecurityPolicy,
    upgradeInsecureRequests: [],
  },
});
const devHeaders = secureHeaders(baseOptions);

/** A deployed Worker has no `DEV_AUTH_EMAIL`; local dev always sets it. */
function isProduction(c: Context<AppEnv>): boolean {
  return !c.env.DEV_AUTH_EMAIL;
}

/**
 * Apply security headers, choosing the HSTS-bearing variant only in production.
 */
export const securityHeaders = createMiddleware<AppEnv>((c, next) =>
  (isProduction(c) ? prodHeaders : devHeaders)(c, next),
);
