import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { accessAuth } from "./middleware/auth";
import { notFound, onError } from "./middleware/error";
import { ok } from "./lib/response";
import { runRiotRefresh } from "./workers/riot-cron";

import { auth } from "./routes/auth";
import { settings } from "./routes/settings";
import { summary } from "./routes/summary";
import { calendar } from "./routes/calendar";
import { weather } from "./routes/weather";
import { fitness } from "./routes/fitness";
import { nutrition } from "./routes/nutrition";
import { sleep } from "./routes/sleep";
import { gaming } from "./routes/gaming";
import { news } from "./routes/news";
import { performance } from "./routes/performance";

const app = new Hono<AppEnv>();

app.onError(onError);
app.notFound(notFound);

// Public, unauthenticated health check (reachable in prod via the /api/* route).
app.get("/api/health", (c) => ok(c, { service: "centralcommand", status: "ok" }));

// All pillar routes require a verified Cloudflare Access identity.
const api = new Hono<AppEnv>();
api.use("*", accessAuth);
api.route("/auth", auth);
api.route("/settings", settings);
api.route("/summary", summary);
api.route("/calendar", calendar);
api.route("/weather", weather);
api.route("/fitness", fitness);
api.route("/nutrition", nutrition);
api.route("/sleep", sleep);
api.route("/gaming", gaming);
api.route("/news", news);
api.route("/performance", performance);

// The single-host topology routes centralcommand.studiosc.dev/api/* to this Worker.
app.route("/api", api);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runRiotRefresh(env));
  },
} satisfies ExportedHandler<Bindings>;
