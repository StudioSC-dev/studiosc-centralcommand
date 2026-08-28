# External Services & APIs

Integration details, gaming architecture, and stack choice rationale for Central Command.

---

## Integration Table

| Integration | Purpose | Auth | Free Tier | Notes |
|---|---|---|---|---|
| Google Calendar API | Calendar events | OAuth 2.0 (refresh token in D1) | Yes | |
| OpenWeatherMap | Weather + forecast | API key | Yes (1,000 req/day) | Standard endpoints only — **no One Call API 3.0** |
| Riot Games API | LoL match data, rank, LP | API key (Worker secret) | Yes (dev key) | See Riot strategy below |
| ESPN NBA RSS | Basketball news | None | Yes | |
| Hacker News RSS | Tech news | None | Yes | |
| TechCrunch RSS | Tech news | None | Yes | |
| PCGamesN LoL RSS | LoL news | None | Yes | |
| Google Maps Embed | Map in the event dialog | API key (public by design) | Yes — **free and unmetered** | Key ships in iframe URL; safety is console restriction (Embed API only + referrer lock) |
| OpenRouteService | Geocoding + routed travel time ("leave by") | API key (Worker secret) | Yes (2,500/day, 40k/month, no card) | Server-side only. Does geocoding and directions |
| Dexerto LoL RSS | LoL news | None | Yes | |

### Explicitly NOT used

- **OpenWeatherMap One Call API 3.0** — requires credit card, violates zero-cost constraint
- **NewsAPI.org** — free tier is dev-only, not for production. Phase 2 if paid plan adopted
- **Google Geocoding / Routes / Distance Matrix** — metered SKUs. OpenRouteService does the
  same job free with no card; Google is used only for the Embed map (genuinely unmetered)
- **OpenWeatherMap geocoding for event locations** — it is a *city* geocoder
  (`/geo/1.0/direct`). It resolves "Manila", not "Cafe Mura" or a street address
- **Reddit RSS** — unstable since 2023 API policy changes
- **Dot Esports RSS** — dropped: general feed drifted to off-topic filler
- **Prisma** — requires binary + paid proxy for edge use
- **Workers AI (Phase 1)** — free tier not permanently guaranteed, deferred to Phase 2
- **Cloudflare Queues (Phase 1)** — not justified at current call volume

---

## Gaming Architecture

Gaming is an **optional, connectable provider** per user — users may have zero or
multiple games connected.

- Schema fields: `provider` (e.g. `riot`, `steam`) and `game` (e.g. `league`, `valorant`)
- **Phase 1:** League of Legends (Riot API) only
- **Phase 2:** Valorant (same Riot API key, same provider)
- **Phase 3:** Dota 2 (OpenDota + Steam API), CS2 (Steam API)
- Riot ID is stored as user-provided value in `gaming_providers`, not hardcoded
- `BurritoBuster#3049` is the dev/test Riot ID — stored as Worker secret, never in source

### Riot API Strategy

- **Cron:** twice daily (8am + 8pm, user's local timezone)
- **KV gate:** 15-minute TTL per user — cron and manual refreshes both check this first
- **Manual refresh:** blocked if last fetch was under 15 minutes ago (KV timestamp)
- **Cold start backfill:** last 20 matches on first connection (21 API calls)
- **Dev key limits:** 20 req/2s, 100 req/2min — 8 calls/day at normal usage
- **Production key:** planned but not a priority
- **Cloudflare Queues:** Phase 2 upgrade for scaled ingest

### Game Scoring

- Custom role-normalized formula using Riot API stats
- Stats: KDA, CS, damage dealt/taken, vision score, kill participation, gold earned,
  objective control
- Scores normalized relative to expected performance for the player's role
- **Explicitly labeled as non-authoritative in all UI and docs** — this is a demo
- Inspired by OP.GG and dpm.lol; not a reverse-engineering attempt

### Ranked Progress

- Solo queue (priority) and flex queue tracked separately
- Rank, LP, win/loss stored with timestamps in `gaming_snapshots`
- Rolling 7-day and 30-day windows
- Fixed period comparison (this week vs last week) available as UI toggle
- Correlated with sleep, nutrition, HRV, and calendar busyness score

---

## Performance Estimator

### Daily Score

```
performance_score = (sleep × 0.40) + (nutrition × 0.35) + (hrv × 0.25)
```

- All sub-scores normalize to 0–100
- HRV optional — defaults to neutral (50) if not provided
- Stored in `performance_scores` with timestamp

### Calendar Busyness Score

- **Phase 1:** Duration-based — total scheduled hours/day, normalized 0–100
- **Phase 2:** Workers AI event classification by type with cognitive weights

---

## Stack Choices

### Why React + Vite over Next.js

Next.js is tightly coupled to Vercel for optimal deployment. This project is
intentionally Cloudflare-native. Vite produces a static bundle that deploys cleanly to
Cloudflare Pages with no adapter complexity, no SSR runtime, and no platform lock-in.

### Why Drizzle over Prisma

Prisma requires a query engine binary that cannot run inside the Cloudflare Workers
runtime. Its edge adapter requires Prisma Accelerate, an external paid proxy. Drizzle
is pure TypeScript, runs directly in the Workers runtime, and has first-class D1 support.

### Why OpenWeatherMap over WeatherAPI

Brand recognition for portfolio purposes. WeatherAPI was the runner-up — more generous
free tier (33k calls/day vs 1k), cleaner response structure, no credit card required.

### Why TanStack Router + Query over React Router

TanStack Router provides end-to-end type safety — route params, search params, and
navigation are all compile-time checked. TanStack Query pairs naturally with it and
handles caching, background refetching, and async state.
