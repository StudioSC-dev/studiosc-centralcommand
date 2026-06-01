import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { auth } from "./middleware/auth";
import { notFound, onError } from "./middleware/error";
import { ok } from "./lib/response";
import { runRiotRefresh } from "./workers/riot-cron";

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

// Public, unauthenticated health check.
app.get("/", (c) => ok(c, { service: "centralcommand", status: "ok" }));

// All pillar routes require the API bearer token.
const api = new Hono<AppEnv>();
api.use("*", auth);
api.route("/summary", summary);
api.route("/calendar", calendar);
api.route("/weather", weather);
api.route("/fitness", fitness);
api.route("/nutrition", nutrition);
api.route("/sleep", sleep);
api.route("/gaming", gaming);
api.route("/news", news);
api.route("/performance", performance);

app.route("/", api);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runRiotRefresh(env));
  },
} satisfies ExportedHandler<Bindings>;
