import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getUserSettings, upsertUserSettings } from "../services/users";

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocationBody {
  timezone?: string | null;
  homeLat?: number | null;
  homeLon?: number | null;
  locationLabel?: string | null;
}

/** Parse the stored JSON TEXT column into a typed array for the response. */
function parseClockZones(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((z): z is string => typeof z === "string") : null;
  } catch {
    return null;
  }
}

/** Map a raw DB settings row to its response shape. */
function toSettingsResponse(row: NonNullable<Awaited<ReturnType<typeof getUserSettings>>>) {
  return { ...row, clockZones: parseClockZones(row.clockZones) };
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

    return ok(c, { settings: current ? toSettingsResponse(current) : null, geoDefaults });
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
    return ok(c, { settings: updated ? toSettingsResponse(updated) : null });
  })
  // Set the weather units display preference.
  .put("/units", async (c) => {
    const body = await c.req.json<{ units?: unknown }>().catch(() => null);
    if (body?.units !== "metric" && body?.units !== "imperial") {
      return fail(c, "bad_request", "units must be 'metric' or 'imperial'.", 400);
    }

    const db = createDb(c.env.DB);
    await upsertUserSettings(db, c.get("userId"), { units: body.units });
    const updated = await getUserSettings(db, c.get("userId"));
    return ok(c, { settings: updated ? toSettingsResponse(updated) : null });
  })
  // Set the world-clock timezone list.
  .put("/clock-zones", async (c) => {
    const body = await c.req.json<{ zones?: unknown }>().catch(() => null);
    if (!body || !Array.isArray(body.zones)) {
      return fail(c, "bad_request", "zones must be an array of IANA timezone strings.", 400);
    }

    const valid = (body.zones as unknown[]).filter(
      (z): z is string => typeof z === "string" && isValidTimezone(z),
    );
    if (valid.length === 0) {
      return fail(c, "bad_request", "No valid IANA timezone names provided.", 400);
    }

    const db = createDb(c.env.DB);
    await upsertUserSettings(db, c.get("userId"), {
      clockZones: JSON.stringify(valid),
    });
    const updated = await getUserSettings(db, c.get("userId"));
    return ok(c, { settings: updated ? toSettingsResponse(updated) : null });
  });
