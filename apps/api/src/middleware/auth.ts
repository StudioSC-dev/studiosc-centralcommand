import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { getOrCreateUser } from "../services/users";
import { fail } from "../lib/response";

/**
 * `accessAuth` guards user-facing routes. Browser traffic is fronted by
 * Cloudflare Access, which injects a signed `Cf-Access-Jwt-Assertion`. We verify
 * it against the team JWKS, then resolve the email to our user. (A bearer-token
 * `serviceAuth` for programmatic callers will return when a service endpoint
 * needs it — `API_BEARER_TOKEN` is reserved for that.)
 */

// JWKS sets are cached per team domain (jose caches the fetched keys internally).
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksByTeam.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, jwks);
  }
  return jwks;
}

export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  let email: string | undefined;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwks(c.env.CF_ACCESS_TEAM_DOMAIN), {
        issuer: `https://${c.env.CF_ACCESS_TEAM_DOMAIN}`,
        audience: c.env.CF_ACCESS_AUD,
      });
      if (typeof payload.email === "string") email = payload.email;
    } catch {
      return fail(c, "unauthorized", "Invalid Access token.", 401);
    }
  } else if (c.env.DEV_AUTH_EMAIL) {
    // Local dev: no Access in front, so fall back to the configured email.
    // DEV_AUTH_EMAIL is never set in production, so this is not a prod bypass.
    email = c.env.DEV_AUTH_EMAIL;
  }

  if (!email) {
    return fail(c, "unauthorized", "No authenticated identity.", 401);
  }

  const user = await getOrCreateUser(createDb(c.env.DB), email);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});
