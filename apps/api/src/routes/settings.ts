import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getUserSettings, upsertUserSettings } from "../services/users";

interface LocationBody {
  timezone?: string | null;
  homeLat?: number | null;
  homeLon?: number | null;
  locationLabel?: string | null;
}

export const settings = new Hono<AppEnv>()
  // Current settings plus Cloudflare edge-geo defaults to pre-fill sign-up.
  .get("/", async (c) => {
    const current = await getUserSettings(createDb(c.env.DB), c.get("userId"));
    const cf = c.req.raw.cf;

    const geoDefaults = {
      timezone: typeof cf?.timezone === "string" ? cf.timezone : null,
      homeLat: cf?.latitude != null ? Number(cf.latitude) : null,
      homeLon: cf?.longitude != null ? Number(cf.longitude) : null,
      locationLabel: typeof cf?.city === "string" ? cf.city : null,
    };

    return ok(c, { settings: current ?? null, geoDefaults });
  })
  // Confirm/update the user's location + timezone.
  .put("/location", async (c) => {
    const body = await c.req.json<LocationBody>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    if (
      (body.homeLat != null && typeof body.homeLat !== "number") ||
      (body.homeLon != null && typeof body.homeLon !== "number")
    ) {
      return fail(c, "bad_request", "homeLat/homeLon must be numbers.", 400);
    }

    await upsertUserSettings(createDb(c.env.DB), c.get("userId"), {
      timezone: body.timezone ?? null,
      homeLat: body.homeLat ?? null,
      homeLon: body.homeLon ?? null,
      locationLabel: body.locationLabel ?? null,
    });

    const updated = await getUserSettings(createDb(c.env.DB), c.get("userId"));
    return ok(c, { settings: updated });
  });
