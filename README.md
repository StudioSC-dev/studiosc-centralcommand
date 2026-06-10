# Central Command

A personal performance dashboard that centralizes calendar, weather, fitness, nutrition,
sleep, gaming, news, tasks, and rule-based insights into a single unified interface —
built entirely on the Cloudflare developer platform.

> Portfolio / demo project by [`studiosc`](https://github.com/studiosc). Architectural
> decisions favor best-practice, zero-cost, edge-native solutions that are presentable
> as a reference implementation.

**v1 is public.** Anyone can sign in with Google to get their own dashboard, or open a
**read-only demo** (no account needed) populated with realistic sample data. During
development the whole app sat behind **Cloudflare Access (Zero Trust)** — see
[Authentication & access](#authentication--access) for how and why that evolved.

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| API runtime | Cloudflare Workers + [Hono](https://hono.dev) |
| ORM | [Drizzle](https://orm.drizzle.team) |
| Database | Cloudflare D1 (SQLite at the edge) |
| Cache | Cloudflare KV |
| Cron | Cloudflare Cron Triggers |
| Auth | Google OAuth 2.0 sign-in + signed session cookies (`jose`) |
| Frontend | React + Vite |
| Frontend host | Cloudflare Pages |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack Query |
| Monorepo | pnpm workspaces + Turborepo |
| CLI | Wrangler |

The entire stack runs on Cloudflare free tiers. No paid services, no credit card on file.

---

## Monorepo layout

```
central-command/
├── apps/
│   ├── api/         → Cloudflare Worker (Hono + Drizzle)
│   └── web/         → React + Vite frontend (TanStack Router + Query)
├── packages/
│   ├── db/          → Drizzle schema + migrations
│   ├── types/       → shared TypeScript interfaces
│   └── utils/       → shared helpers (scoring, dates)
└── turbo.json       → task orchestration
```

---

## Features

- **Weather** — current conditions, sunrise/sunset arc, wind, atmospheric detail, an hourly
  strip and a 5-day outlook (OpenWeatherMap standard endpoints only).
- **Calendar / Today** — Google Calendar (read-only): a "Today" card with a live schedule
  (past events struck through) and busyness gauge, plus an upcoming-week agenda.
- **Health** — manual sleep / fitness / nutrition logging, including HRV and resting HR.
- **Performance** — a daily score (sleep · nutrition · HRV) with a 30-day trend chart and
  resting-HR averages.
- **Gaming** — League of Legends via the Riot API (rank, recent matches, role-normalized
  non-authoritative scores, win-rate windows).
- **News** — RSS aggregation (ESPN NBA, Hacker News, TechCrunch, PCGamesN, Dexerto).
- **Tasks** — a native priorities list (importance × urgency).
- **Insights** — rule-based observations computed from the user's own data (zero external
  calls): sleep↔performance and weather↔performance correlations, weekly trends, activity
  and task nudges.
- **Onboarding & profile** — first-run capture of name / birthdate / sex; optional body
  metrics on the profile page; per-user units, location, and theme in settings.

---

## Authentication & access

The auth model evolved across the project, which is itself part of the story:

- **During development — Cloudflare Access (Zero Trust).** The entire deployed app sat
  behind Cloudflare Access with Google SSO, locked to a single allowed identity. The API
  verified the `Cf-Access-Jwt-Assertion` JWT against the team JWKS (issuer + AUD). This
  gave a real, zero-config, zero-cost gate while the app was single-user and unfinished.
- **For the v1 public release — first-party Google sign-in.** Access is removed and the
  app authenticates itself: Google OAuth 2.0 (PKCE + `state`) establishes a **stateless,
  signed session JWT** stored in an HttpOnly / Secure / SameSite=Lax cookie — no
  per-request database read. Sign-in uses minimal scopes (`openid email profile`); the
  Calendar pillar requests `calendar.readonly` later via **incremental** consent. OAuth
  tokens are encrypted at rest (AES-GCM) in D1.
- **Public read-only demo.** A "View demo" path issues a session for a shared, seeded demo
  user. A middleware blocks every write (`403`) and the live-fetch pillars serve fixtures,
  so demo visitors never mutate shared state or touch the third-party API keys.
- **Rate limiting.** Per-user daily counters plus global per-API daily caps (KV-backed)
  protect the free tiers and the shared keys — OpenWeatherMap's 1k/day, the Riot key, and
  Google Calendar — returning `429` when a ceiling is reached.

The transition was deliberately deploy-safe: the session middleware kept the Access-JWT
path as a fallback so production never broke mid-migration, and that fallback was removed
only once the Access apps came down.

---

## Getting started

```bash
# Install all workspace dependencies
pnpm install

# Run everything in dev (Worker + Vite) via Turborepo
pnpm dev

# Typecheck / build the whole monorepo
pnpm typecheck
pnpm build
```

### Per-app

```bash
# API (Cloudflare Worker)
pnpm --filter @central-command/api dev
pnpm --filter @central-command/api deploy

# Web (React + Vite)
pnpm --filter @central-command/web dev
pnpm --filter @central-command/web build
```

### Database (Drizzle + D1)

```bash
# Generate a migration from the schema
pnpm --filter @central-command/db generate

# Apply migrations to the D1 database
wrangler d1 migrations apply central-command-db
```

Secrets (OpenWeatherMap key, Riot API key, Google OAuth client id/secret,
`TOKEN_ENCRYPTION_KEY` for token-at-rest encryption, `SESSION_SECRET` for signing session
cookies) are provided as Worker secrets and, for local dev, via an untracked
`apps/api/.dev.vars` file. See `apps/api/.dev.vars.example`.

### Demo data

```bash
# Seed (or refresh) the shared read-only demo user — relative dates, idempotent
pnpm --filter @central-command/api run seed:demo:local    # local D1
pnpm --filter @central-command/api run seed:demo:remote   # remote D1
```

---

## Architectural notes

A few deliberate tradeoffs, documented for the accompanying blog post:

- **Drizzle over Prisma** — Prisma needs a query-engine binary (and the paid Accelerate
  proxy) to run at the edge. Drizzle is pure TypeScript and runs directly in the Workers
  runtime with first-class D1 support.
- **React + Vite over Next.js** — Next.js is tightly coupled to Vercel for optimal
  deployment. Vite emits a static bundle that deploys cleanly to Cloudflare Pages with no
  adapter and no SSR runtime.
- **TanStack Router over React Router** — end-to-end type safety: route params and search
  params are compile-time checked, so a route typo is a build error rather than a runtime
  bug. TanStack Query pairs with it for caching and async state, complementing the KV
  cache on the API side.
- **OpenWeatherMap over WeatherAPI** — chosen for brand recognition. WeatherAPI was the
  runner-up (more generous free tier, cleaner responses, no card required). Only the
  standard Current Weather and 5-Day Forecast endpoints are used — never One Call API 3.0,
  which requires a card on file.
- **Calendar busyness score** — Phase 1 is duration-based (scheduled hours/day, normalized
  0–100). Phase 2 upgrades to Workers AI heuristic classification of event types.
- **Demo as a seeded backend user, not frontend fixtures** — the demo exercises the real
  API and data paths (one shared, read-only seeded account) rather than mocking responses
  in the client, so it stays honest to the actual stack while a write guard prevents any
  shared-state corruption.
- **KV rate limiting over Durable Objects** — KV counters are eventually consistent, so the
  caps are a safety ceiling rather than an exact quota. That's the right tradeoff for
  protecting free tiers on a portfolio app; strict atomicity (Durable Objects) is a
  documented later option.

---

## Status

**v1 — public.** Phase 1 feature set complete (all pillars, tasks, insights, onboarding,
profile/settings), public Google sign-in + read-only demo, rate-limited, deployed on
Cloudflare. See the in-repo session log for the full decision history. Phase 2 (wearable /
nutrition integrations, Valorant, Workers AI insights, external task sources) is next.
