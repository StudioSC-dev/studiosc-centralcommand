# CLAUDE.md
# Instructions for Claude — studiosc/central-command

This file governs how Claude should behave in every session that touches this codebase.
Read this before writing, editing, or reviewing any code.

---

## Project Identity

- **Project name:** Central Command (`studiosc-centralcommand`)
- **Repo:** `central-command`
- **Owner handle:** `studiosc`
- **Purpose:** Personal performance dashboard — a Cloudflare-native API aggregator and
  frontend that centralizes calendar, weather, fitness, nutrition, sleep, gaming, and
  news data into a single unified interface.
- **Nature:** Portfolio/demo project. Decisions should reflect best practices and be
  presentable to potential employers or collaborators.

---

## Cross-project integrations

Contracts that span repos live in `../integrations/`. Read the relevant contract before
touching either side; the umbrella `../CLAUDE.md` lists the estate.

**Active:** [`../integrations/homelab-telemetry.md`](../integrations/homelab-telemetry.md)
— homelab pushes state snapshots and ntfy events to a Worker ingest endpoint. Status:
agreed in principle, not started. Key constraints:

1. Phase 1 is card visibility only — toggle which cards appear, fixed order, no spans.
2. The 3x3 grid is exactly full — a tenth card requires the registry + visibility work.

---

## In-repo design docs

`docs/` holds long-lived reference docs. Read the relevant one before touching the
feature it covers, and update it in the same PR as the code.

| Doc | Covers |
|---|---|
| [ui-suite.md](docs/ui-suite.md) | Dynamic dashboard layout: card show/hide, sizing, grid substrate, storage decisions |
| [notifications.md](docs/notifications.md) | Notification system design |
| [data-model.md](docs/data-model.md) | D1 schema (all tables), KV cache TTLs, KV write budget, auth architecture |
| [external-services.md](docs/external-services.md) | Integration table, gaming architecture, Riot API, performance estimator, stack choices |
| [roadmap.md](docs/roadmap.md) | Phase 1-3 feature plan, deployment commands |
| [linear-workflow.md](docs/linear-workflow.md) | Linear project management: session protocol, templates, epics |

---

## Prime Directives

1. **Never make assumptions.** If anything is unclear — a requirement, a file path, a
   variable name, an integration detail — stop and ask.
2. **Minimize cost.** Free tiers only. Flag immediately if a solution requires paid
   services.
3. **TypeScript everywhere.** No JavaScript files. No `any` types unless explicitly
   approved.
4. **Cloudflare-native only.** No Node.js-specific APIs, no Vercel features. Workers
   runtime uses Web Standard APIs only.
5. **Ask before adding dependencies.** Every new npm package must be justified.
6. **Multi-user by default.** Never hardcode user-specific logic.

---

## Stack Reference

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Runtime | Cloudflare Workers |
| API Framework | Hono |
| ORM | Drizzle |
| Database | Cloudflare D1 |
| Cache | Cloudflare KV |
| Queues | Cloudflare Queues (Phase 2) |
| Cron | Cloudflare Cron Triggers |
| Auth | Cloudflare Access + OAuth 2.0 |
| Frontend | React + Vite |
| Frontend host | Cloudflare Pages |
| Frontend routing | TanStack Router |
| Frontend data | TanStack Query |
| Monorepo | pnpm workspaces + Turborepo |
| CLI | Wrangler |

Stack rationale (why Drizzle over Prisma, React+Vite over Next, etc.) is in
[docs/external-services.md](docs/external-services.md#stack-choices).

---

## Monorepo Structure

```
central-command/
├── apps/
│   ├── api/                        → Cloudflare Worker (Hono + Drizzle)
│   │   ├── src/
│   │   │   ├── routes/             → one file per pillar
│   │   │   ├── services/           → third-party API clients
│   │   │   ├── workers/            → cron jobs, queue consumers
│   │   │   ├── middleware/         → auth, error handling, logging
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── web/                        → React + Vite frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   └── lib/                → API client, TanStack Query hooks
│       └── package.json
├── packages/
│   ├── db/                         → Drizzle schema + migrations
│   ├── types/                      → shared TypeScript interfaces
│   └── utils/                      → shared helpers (scoring, dates, etc.)
├── docs/                           → committed design docs
├── .gitignore
├── CLAUDE.md                       → this file
├── HANDOVER.md                     → session decision log (gitignored)
├── README.md
├── package.json                    → pnpm workspace root
└── turbo.json
```

---

## API Routes

All routes live under `apps/api/src/routes/`. One file per pillar:

```
routes/
├── summary.ts       → GET /summary
├── calendar.ts      → GET /calendar
├── weather.ts       → GET /weather
├── fitness.ts       → GET /fitness, POST /fitness/log
├── nutrition.ts     → GET /nutrition, POST /nutrition/log
├── sleep.ts         → GET /sleep, POST /sleep/log
├── gaming.ts        → GET /gaming
├── news.ts          → GET /news
├── performance.ts   → GET /performance
├── tasks.ts         → GET/POST /tasks, PATCH/DELETE /tasks/:id
└── insights.ts      → GET /insights
```

---

## Session Workflow

Follow [docs/linear-workflow.md](docs/linear-workflow.md) — update HANDOVER.md and
Linear after every session; create tickets before writing code in planning sessions.

---

## Commit Conventions

**Conventional Commits**, one line only — no body, ever.

```
<type>(<scope>): <short summary>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`.
Scopes: `api`, `web`, `db`, `types`, `utils`, `ci`, `infra`.

Summary: lowercase, imperative, no period, under 72 characters.

---

## What Claude Should Never Do

- Add `any` types without asking first
- Install a new dependency without justifying it
- Use Node.js-specific APIs (`fs`, `path`, `process.env` directly, etc.)
- Suggest Vercel, Railway, Render, or any non-Cloudflare hosting
- Use Prisma
- Use OpenWeatherMap One Call API 3.0
- Hard-code secrets, API keys, email addresses, or Riot IDs in source files
- Design any feature for a single user — always assume multi-user
- Assume a requirement is obvious — always confirm ambiguity
- Skip migration files when changing the D1 schema
- Write to KV on a path that runs on every request — see [KV Write Budget](docs/data-model.md#kv-write-budget)
- Set a KV `expirationTtl` equal to or shorter than the client poll interval
- Implement Workers AI in Phase 1
- Implement Cloudflare Queues in Phase 1
- Use React Router — TanStack Router is the chosen routing library
