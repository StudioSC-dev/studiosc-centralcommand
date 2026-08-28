# Roadmap & Deployment

Phase plan and deployment procedures for Central Command.

---

## Deployment

```bash
# API (Cloudflare Workers)
cd apps/api && wrangler deploy

# Frontend (Cloudflare Pages)
cd apps/web && wrangler pages deploy dist

# D1 migrations
wrangler d1 migrations apply central-command-db

# From monorepo root
turbo build && turbo deploy
```

CI/CD via GitHub Actions on push to `main`.

---

## Phase 1 (current)

- Manual input for sleep, fitness, nutrition
- Google Calendar OAuth
- OpenWeatherMap (standard endpoints only)
- League of Legends (Riot API, dev key)
- RSS news (ESPN NBA, Hacker News, TechCrunch, PCGamesN + Dexerto LoL)
- Duration-based busyness score
- Role-normalized game scoring
- Native tasks pillar (current priorities, manual CRUD)
- Rule-based insights (correlations/observations from logged data)
- Light/dark theme, 3-column dashboard grid
- Google Calendar push (webhook → KV invalidation) + disconnect/revoke
- **Dynamic dashboard layout** — card show/hide, then card sizing.
  See [ui-suite.md](ui-suite.md)
- Cloudflare Access (personal Google account only)
- TanStack Router + TanStack Query on frontend

## Phase 2

- Apple Health, Garmin, Fitbit, Oura Ring
- MyFitnessPal / Cronometer nutrition sync
- Valorant (Riot API, same provider as LoL)
- Task sources: Linear / Jira / Trello
- Workers AI (busyness classification + daily briefing + LLM insights narrative)
- Cloudflare Queues (Riot API, scaled ingest)
- NewsAPI.org (if paid plan adopted)
- Microsoft/Outlook Calendar
- Email+password auth
- Cloudflare Access demo mode (open to portfolio visitors)
- Riot production API key

## Phase 3

- Dota 2 (OpenDota + Steam API)
- CS2 (Steam API)
- Deeper Riot analytics (champion mastery, role trends)
