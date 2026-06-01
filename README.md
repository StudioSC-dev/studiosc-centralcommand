# Central Command

A personal performance dashboard that centralizes calendar, weather, fitness, nutrition,
sleep, gaming, and news data into a single unified interface — built entirely on the
Cloudflare developer platform.

> Portfolio / demo project by [`studiosc`](https://github.com/studiosc). Architectural
> decisions favor best-practice, zero-cost, edge-native solutions that are presentable
> as a reference implementation.

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
| Auth | Cloudflare Access + OAuth 2.0 |
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

Secrets (Riot API key, OpenWeatherMap key, OAuth client secret, API bearer token) are
provided as Worker secrets and, for local dev, via an untracked `apps/api/.dev.vars`
file. See `apps/api/.dev.vars.example`.

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

---

## Status

Phase 1 — scaffolding. See the in-repo session log for the full decision history.
