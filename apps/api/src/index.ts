import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { sessionAuth } from "./middleware/auth";
import { demoReadOnly } from "./middleware/demo";
import { notFound, onError } from "./middleware/error";
import { securityHeaders } from "./middleware/security";
import { ok } from "./lib/response";
import { runRiotRefresh } from "./workers/riot-cron";

import { authPublic, authGuarded } from "./routes/auth";
import { settings } from "./routes/settings";
import { profile } from "./routes/profile";
import { summary } from "./routes/summary";
import { calendar } from "./routes/calendar";
import { weather } from "./routes/weather";
import { fitness } from "./routes/fitness";
import { nutrition } from "./routes/nutrition";
import { sleep } from "./routes/sleep";
import { gaming } from "./routes/gaming";
import { news } from "./routes/news";
import { performance } from "./routes/performance";
import { tasks_routes } from "./routes/tasks";
import { insights } from "./routes/insights";

const app = new Hono<AppEnv>();

app.onError(onError);
app.notFound(notFound);

// Security headers on every response (HSTS/upgrade-insecure-requests gated to
// production inside the middleware). Must run first so it covers errors too.
app.use("*", securityHeaders);

// Public, unauthenticated health check (reachable in prod via the /api/* route).
app.get("/api/health", (c) => ok(c, { service: "centralcommand", status: "ok" }));

// Public auth routes — sign-in begins/ends here, so they sit OUTSIDE the session
// guard. A per-IP limiter is applied inside the group (see routes/auth.ts).
app.route("/api/auth", authPublic);

// Everything below requires an authenticated session (cookie, Access JWT, or dev).
const api = new Hono<AppEnv>();
api.use("*", sessionAuth);
api.use("*", demoReadOnly); // demo sessions are read-only (blocks non-GET)
api.route("/auth", authGuarded);
api.route("/settings", settings);
api.route("/profile", profile);
api.route("/summary", summary);
api.route("/calendar", calendar);
api.route("/weather", weather);
api.route("/fitness", fitness);
api.route("/nutrition", nutrition);
api.route("/sleep", sleep);
api.route("/gaming", gaming);
api.route("/news", news);
api.route("/performance", performance);
api.route("/tasks", tasks_routes);
api.route("/insights", insights);

// The single-host topology routes centralcommand.studiosc.dev/api/* to this Worker.
app.route("/api", api);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runRiotRefresh(env));
  },
} satisfies ExportedHandler<Bindings>;
