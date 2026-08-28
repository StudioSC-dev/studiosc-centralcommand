# Data Model & Storage

Reference for Central Command's D1 schema, KV caching, and auth model.

---

## D1 Schema

### Auth

```
users
  id            TEXT PRIMARY KEY  -- UUID v7
  email         TEXT UNIQUE
  created_at    INTEGER

auth_providers
  user_id       TEXT  -- FK → users.id
  provider      TEXT  -- 'google' | 'microsoft' | 'local'
  provider_id   TEXT  -- provider's own user ID (null for local)
  access_token  TEXT
  refresh_token TEXT
  expires_at    INTEGER

auth_credentials
  user_id       TEXT  -- FK → users.id (local provider only)
  password_hash TEXT
  updated_at    INTEGER
```

### User

```
user_profiles     -- display name, riot_id, riot_region (0009, 0010)
user_settings     -- timezone, home_lat/lon, location_label, units
                  -- the three UI-suite JSON columns (0012/0013/0014) were
                  -- consolidated into dashboard_cards and DROPPED in 0016
card_presets      -- user-defined layout presets (0015); one row per saved
                  -- arrangement: name, visible roster JSON, sparse sizes JSON
dashboard_cards   -- per-card layout exceptions (0016); PK (user_id, card),
                  -- columns hidden / position / size. No row = visible, 1x1,
                  -- registry order. See docs/ui-suite.md D15
calendar_channels -- one Google Calendar watch channel per user (0011);
                  -- channel_id, resource_id, token, expiration
```

### Data

- `calendar_events`
- `weather_snapshots`
- `fitness_logs`
- `nutrition_logs`
- `sleep_logs`
- `gaming_providers` — per-user connected games (`provider`, `game`, `riot_id`, etc.)
- `gaming_snapshots` — match results, KDA, CS, rank, LP, win/loss
- `performance_scores`
- `news_items`
- `geocode_cache` — place string → coordinates (0017), for the Today card's "leave by"
  estimate. **Not user-scoped**: a place resolves the same for everyone, and no user id
  belongs in a table of public coordinates. Misses are cached too (`resolved = 0`) so an
  unresolvable location is not re-asked of the geocoder on every calendar refresh. In D1
  rather than KV precisely because a miss is a *write* — see **KV Write Budget**
- `tasks` — native "current priorities" (`priority`, `status`, `position`, `source`);
  Phase 2 adds external sources (Linear/Jira/Trello) via `source`/`external_id`

Schema definitions live in `packages/db/schema.ts`. Migrations in `packages/db/migrations/`.
**Read the migrations directory** to determine the current count — this doc has been
wrong before.

---

## Auth Architecture

- **Cloudflare Access** — protects the deployed dashboard URL, Google SSO
- **OAuth 2.0 flow** — `/auth/google` → `/auth/google/callback` → tokens written to D1
- **User identity** — UUID v7, generated on first login, stored in `users` table
- **Provider identity** — Google `sub` claim stored in `auth_providers`, never used as primary key
- **API key** — static Bearer token for API layer, stored as Worker secret
- **Password hashing** — `auth_credentials` table, separated from OAuth tokens

---

## KV Cache TTLs

| Data type | TTL |
|---|---|
| Weather current | 30 minutes |
| Weather forecast | 1 hour |
| News (all topics) | 1 hour |
| Riot match data | 15 minutes |
| Riot live game status | 5 minutes (`LIVE_TTL`; must stay > the client poll interval) |
| Calendar events | 15 minutes (backstop; push webhook drives real freshness) |

---

## KV Write Budget

**The binding constraint on this project is KV writes, not reads.** The free tier is
100,000 reads/day but only **1,000 writes/day** (and 1,000 deletes/day). That 100:1 ratio
is KV's whole design: write a value once, serve it from cache thousands of times.

The dashboard is built to live on a second monitor indefinitely, so treat **one always-on
client as a permanent background load**, not as an idle tab. At a 60s poll interval, one
card costs ~1,440 requests/day. Two polling cards is ~2,880. Any per-request KV write is
therefore ~3× the entire daily write budget before a second user exists.

The rule:

> **A KV write must be gated behind a cache miss.** Never write to KV on a code path that
> runs on every request.

This is why `services/rate-limit.ts` limits only *fresh third-party fetches* (OWM, Google,
Riot) — those already run only on a cache miss, so their counters cost a handful of writes
a day.

**Per-request or per-user rate limiting does not belong in KV.** Two correct substrates:

- **Cloudflare WAF rate-limiting rule** on `centralcommand.studiosc.dev/api/*` — free, runs
  in front of the Worker, zero storage ops, no code. The default choice.
- **Durable Object with the SQLite backend** — free-plan eligible (the KV-backed DO
  backend is paid-only), 100k row writes/day, and gives real atomic increments, which KV
  cannot: KV's eventual consistency means two near-simultaneous requests both read the same
  count and both write the same increment. Justified only when quotas must be genuinely
  per-user.

When adding a polling card, state its writes/day in the PR. When adding a KV `put`, say
what cache miss gates it.
