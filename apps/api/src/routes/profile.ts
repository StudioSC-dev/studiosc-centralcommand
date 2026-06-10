import { Hono } from "hono";
import type { ActivityLevel, ProfileInput, Sex } from "@central-command/types";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok, fail } from "../lib/response";
import { getProfile, upsertProfile } from "../services/profile";

const SEXES: Sex[] = ["male", "female", "other"];
const ACTIVITY: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize the incoming profile body. Returns the clean input or an error string. */
function clean(body: Record<string, unknown>): ProfileInput | string {
  const out: ProfileInput = {};

  if (body.displayName !== undefined) {
    const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!name) return "displayName must be a non-empty string.";
    if (name.length > 80) return "displayName is too long.";
    out.displayName = name;
  }
  if (body.birthdate !== undefined && body.birthdate !== null) {
    if (typeof body.birthdate !== "string" || !ISO_DATE.test(body.birthdate)) {
      return "birthdate must be YYYY-MM-DD.";
    }
    const t = Date.parse(body.birthdate);
    if (Number.isNaN(t) || t > Date.now()) return "birthdate must be a valid past date.";
    out.birthdate = body.birthdate;
  } else if (body.birthdate === null) {
    out.birthdate = null;
  }
  if (body.sex !== undefined) {
    if (body.sex !== null && !SEXES.includes(body.sex as Sex)) return "sex is invalid.";
    out.sex = body.sex as Sex | null;
  }
  if (body.heightCm !== undefined) {
    if (body.heightCm === null) out.heightCm = null;
    else if (typeof body.heightCm === "number" && body.heightCm >= 50 && body.heightCm <= 260) {
      out.heightCm = Math.round(body.heightCm);
    } else return "heightCm must be 50–260 (cm).";
  }
  if (body.weightKg !== undefined) {
    if (body.weightKg === null) out.weightKg = null;
    else if (typeof body.weightKg === "number" && body.weightKg >= 20 && body.weightKg <= 400) {
      out.weightKg = Math.round(body.weightKg * 10) / 10;
    } else return "weightKg must be 20–400 (kg).";
  }
  if (body.activityLevel !== undefined) {
    if (body.activityLevel !== null && !ACTIVITY.includes(body.activityLevel as ActivityLevel)) {
      return "activityLevel is invalid.";
    }
    out.activityLevel = body.activityLevel as ActivityLevel | null;
  }

  return out;
}

/** GET /profile, PUT /profile — the user's profile (onboarding + editable details). */
export const profile = new Hono<AppEnv>()
  .get("/", async (c) => {
    const p = await getProfile(createDb(c.env.DB), c.get("userId"));
    return ok(c, { profile: p });
  })
  .put("/", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return fail(c, "bad_request", "Invalid JSON body.", 400);

    const input = clean(body);
    if (typeof input === "string") return fail(c, "bad_request", input, 400);

    const updated = await upsertProfile(createDb(c.env.DB), c.get("userId"), input);
    return ok(c, { profile: updated });
  });
