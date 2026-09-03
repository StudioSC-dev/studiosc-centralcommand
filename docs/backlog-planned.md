# Backlog — Planned work

Items that need design, cross-project coordination, or are large enough to span
multiple sessions. Each section captures what is already designed-for, what is open,
and what blocks starting.

**Last updated:** 2026-09-02

---

## PL-1: External notification sources (Slack, Gmail, Linear, etc.)

The notifications spine is already designed for this — `notifications.md` is the
owning document. The `notification_sources` table, the feed-vs-counter distinction
(D1 there), and the `source` discriminator all exist.

### What is already built

- `notifications` table with `source` TEXT (no CHECK — adding a source is not a
  schema change)
- `notification_sources` table with nullable `unread_count` — `NULL` means derive
  from the feed, a number means the collector reported it
- `appendNotifications()` with `sanitiseText()` at the choke point
- `POST /api/lab/events` as the reference collector (lab adapter → spine)
- Idempotent ingest: `UNIQUE(user_id, source, external_id)`, insert-or-ignore

### Planned sources (from notifications.md build order)

| Source | Type | Auth | Integration model |
|---|---|---|---|
| **Gmail** | counter | Existing Google OAuth + `gmail.readonly` scope | Collector polls unread count; no individual messages stored. **Restricted scope** — raises verification bar if the app goes public, interacts with the Cloudflare Access demo-mode question |
| **Slack** | feed or counter | Slack OAuth or incoming webhook | Webhook sniffer for mentions/DMs, or poll unread count via Slack API |
| **Linear** | feed | Linear webhook or API key | Webhook for assigned issues, mentions, PR links |
| **Trello** | feed or counter | Trello API key + token | Webhook for card assignments, due dates |
| **Calendar/Tasks/Gaming/Weather** | feed | Internal (no new auth) | Pillar collectors — existing services feeding noteworthy events into the spine (e.g. "meeting in 15 min", "win streak broken") |

### What needs deciding

- **Gmail scope upgrade.** Adding `gmail.readonly` to the existing Google OAuth makes
  the consent screen request a **restricted** scope. If the app is ever opened to
  portfolio visitors via Cloudflare Access demo mode, it would need Google verification.
  Decision: defer Gmail until the demo-mode question is settled, or implement it
  behind a feature gate that demo users never see.
- **Slack/Linear/Trello auth model.** Each needs its own OAuth flow or a simpler
  webhook registration. For a single-user app, incoming webhooks are simpler. For
  multi-user, OAuth. The existing `auth_providers` table supports multiple providers
  per user.
- **Pillar collectors.** These are the cheapest sources — they read data already in
  D1 and write notification rows. The question is what events are worth notifying
  about. A calendar event starting in 15 minutes is obvious; "your performance score
  dropped 20 points" is less clear.
- **Counter display.** A count-only source (Gmail, possibly Slack) contributes no
  rows to the feed list — it only shows a badge number. The card's tab UI (ME-1 in
  backlog-near.md) needs to handle a tab with a count and no list gracefully.

### Blockers

- ME-1 (notifications card cleanup) should ship first — it builds the tab/grouping
  UI that external sources will populate.
- Each external source with its own OAuth needs a consent flow and token storage.
  The plumbing exists for Google; Slack/Linear/Trello would be new.

---

## PL-2: Trailhead integration card

Trailhead is the self-hosted orchestrator that turns tagged tickets into PRs via
ephemeral Claude Code workers. A dedicated card would show job status, queue depth,
and recent completed PRs.

### Integration model

Similar to the homelab integration: Trailhead pushes status to a Worker ingest
endpoint. Needs a contract in `../integrations/`.

| Data | Shape | Push frequency |
|---|---|---|
| Queue depth (pending jobs) | Snapshot counter | On change |
| Active workers | Snapshot counter | On change |
| Recent completed jobs | Feed (PR link, ticket ref, duration, outcome) | On completion |
| Errors / failed jobs | Feed (error summary, ticket ref) | On failure |

### What needs building

- **Contract:** `../integrations/trailhead-status.md` — defines the wire format,
  auth model (lab-style source token), and what Trailhead pushes
- **Trailhead side:** a status reporter that POSTs snapshots and events to the
  Central Command Worker. This is work in the `trailhead` repo.
- **Central Command side:**
  - `POST /api/trailhead/events` ingest endpoint (same pattern as `lab-ingest.ts`)
  - D1 table or feed into the notifications spine (or both — snapshots for the card's
    state display, events for the notifications feed)
  - New `CardKey`: `trailhead`
  - Component: queue depth, active workers, recent jobs list with PR links and
    outcomes, error count
  - Fit strategy: counters never drop, job list clamps

### What needs deciding

- **Separate card vs. notifications only.** A card shows live state (queue, workers);
  notifications show events (completed, failed). Both are useful. Recommendation:
  a dedicated card for state, and job completions/failures also feed the notification
  spine — the same split the homelab uses (Homelab card for state, Notifications card
  for events).
- **Whether Trailhead is ready.** Check `trailhead/CLAUDE.md` and its current state
  before starting the integration — the orchestrator needs to be running reliably
  before it can report status.

### Blockers

- Trailhead must be running and stable enough to report from.
- The contract must be written and agreed before either side builds.
- This is cross-project work — each side is a separate commit in a separate repo on
  its own branch.

---

## PL-3: Health card — external data sources

Phase 2 roadmap item. The Health card currently accepts manual input for sleep,
fitness, and nutrition. External sources would populate it automatically.

### Candidates

| Source | Data | Auth | Free tier | Notes |
|---|---|---|---|---|
| **Oura Ring** | Sleep, HRV, readiness, activity | OAuth 2.0 | Yes (personal use) | Best fit — exactly the data the performance estimator wants |
| **Garmin Connect** | Sleep, HR, steps, stress | OAuth 1.0a | Yes | Awkward auth; data is good |
| **Fitbit** | Sleep, HR, steps, active minutes | OAuth 2.0 | Yes (but Google-owned, API future uncertain) | Broad user base |
| **Apple Health** | Everything | No direct API | N/A | Requires a mobile app bridge (Expo app in the stack, or a shortcut-based export). No server-to-server path exists |
| **Whoop** | HRV, strain, recovery, sleep | OAuth 2.0 | Yes (but hardware is subscription) | Very good data if user has one |

### Recommendation

Start with **Oura** — clean OAuth 2.0, generous free tier, and the data maps directly
to the performance estimator's inputs (sleep quality, HRV, readiness score). The
existing manual-input path stays as a fallback and for users without a device.

### What needs building

- OAuth flow for the chosen provider (extends `auth_providers`)
- A sync service that pulls daily summaries (cron or on-demand)
- KV cache with appropriate TTL (health data changes at most daily)
- Merge logic: when both manual and external data exist for the same day, which wins?
  Probably external, with manual as override.
- Migration to link `fitness_logs` / `sleep_logs` to a source

### Blockers

- Requires a physical device to test properly
- OAuth verification for health APIs may have stricter requirements
- The performance estimator should be validated against real data before relying on it

---

## PL-4: Keep / notes / quick-capture

Google Keep has no public API. Alternatives:

| Option | Pros | Cons |
|---|---|---|
| **Native quick-capture** (D1-backed) | No external dependency; full control; works offline | Yet another note-taking surface |
| **Google Tasks** | Has an API; shares existing Google OAuth; "remind me" from Assistant lands here | Limited — no rich text, no images, no nested lists |
| **Notion** | Rich API; popular | OAuth; a dependency on an external service; overkill for quick capture |
| **Obsidian** | Local markdown files | No API; desktop-only; sync is paid |

### Recommendation

**Google Tasks** is the pragmatic choice — it reuses the existing Google OAuth, the
API is stable, and it covers the "quick capture + reminder" use case. A native
quick-capture card in D1 is the fallback if Google Tasks feels too limited.

Either way, this overlaps with the existing Tasks card (`tasks.ts`), which is a
native task list. Decide whether this is a *second* card or an *extension* of the
existing one (a `source` field on tasks, similar to how gaming has `provider`).

### Blockers

- Product decision: what is this card *for*? Quick thoughts? Reminders? A scratchpad?
  The answer determines whether it's Google Tasks, a native capture, or something else.

---

## PL-5: Native desktop client

`notifications.md` build order step 4 names Tauri as the desktop shell. Rust toolchain
is a new dependency requiring approval.

### Why Tauri over Electron

| | Tauri | Electron |
|---|---|---|
| Binary size | ~5 MB | ~150 MB |
| Runtime | System webview | Bundled Chromium |
| Backend | Rust | Node.js |
| Memory | ~30 MB | ~150 MB+ |
| Native APIs | Tray, notifications, global shortcuts | Same, plus more maturity |
| Aligns with free-tier ethos | Yes — minimal, no bundled runtime | No — ships a browser |

### What it would do

- Wrap the existing web app in a native window
- System tray with unread notification count
- Native OS toast notifications (fed by the notification spine)
- Global keyboard shortcut to show/hide
- Auto-start on login (optional)

### Prerequisite: PWA first

A **Progressive Web App** covers 80% of the native client's value at 10% of the cost:

- Installable on desktop (Windows, Mac, Linux) and mobile
- Push notifications via the Web Push API (service worker + VAPID keys)
- Offline shell with cached assets
- No new build toolchain, no new language, no app store

The service worker needed for PWA push is also needed for web push notifications
(notifications.md build order step 3), so this work pays for itself regardless.

**Recommendation:** ship PWA first. If the native-only features (tray icon, global
shortcut, auto-start) turn out to matter, Tauri wraps the same web app later — the
PWA work is not wasted, it becomes Tauri's frontend.

### Blockers

- Web push (VAPID keys, service worker) is a prerequisite for meaningful push in
  either path. New dependency — needs approval.
- Tauri requires the Rust toolchain. New dependency — needs approval.
- The notification spine should have multiple sources feeding it before a native
  client is worth building — otherwise it is a native wrapper around a web app that
  already works in a browser tab.

---

## PL-6: Homelab network usage

Show current network throughput on the dashboard, primarily driven by qBittorrent but
with the option to see overall network usage separately.

### Data model

Two views of the same data:

| View | What it shows | Privacy concern |
|---|---|---|
| **Overall network** | Aggregate up/down throughput for the homelab host | Low |
| **qBittorrent** | Per-client up/down, active torrents, ratio | High — user must be able to hide this |

The user needs the ability to **hide qBittorrent detail** while still seeing aggregate
network stats, or hide the entire section. This maps naturally to the existing card
visibility system — it could be a section within the Homelab card (toggleable) or a
standalone card.

### Integration model

Same pattern as existing homelab telemetry: the homelab pushes snapshots to a Worker
ingest endpoint. The collector on the homelab side reads from:

- **System-level:** `/proc/net/dev` or `vnstat` for aggregate throughput
- **qBittorrent:** its Web API (`/api/v2/transfer/info` for global rates,
  `/api/v2/torrents/info` for active list) — already exposed behind Traefik

### Options

| Approach | Pros | Cons |
|---|---|---|
| **Section in Homelab card** | No new card; keeps lab data together; fits `data-drop-order` shedding | Card is already dense; network section competes with service health |
| **Standalone `network` card** | Clean separation; own visibility toggle for free; can size independently | Another card in the registry; needs `defaultHidden` |
| **Both, with toggle** | Maximum flexibility | More UI surface to maintain |

**Recommendation:** standalone `network` card, defaultHidden. The Homelab card is about
service health; network throughput is a different concern. A separate card lets the user
show aggregate-only or aggregate+qBittorrent via a card-level setting, and hide the
whole thing from the grid independently.

### What needs building

**Homelab side (`homelab` repo):**
- A network collector (shell script or container) that reads system throughput and
  qBittorrent API, pushes to Central Command on an interval (30s–60s)
- Contract: `../integrations/homelab-network.md`

**Central Command side:**
- `POST /api/lab/network` ingest endpoint (or extend existing `/api/lab/events`)
- KV snapshot storage (latest network state per user, short TTL)
- New `CardKey`: `network`
- Component: current up/down rates, qBittorrent section (active torrents, ratio) with
  a toggle to hide it, sparkline or mini chart for recent throughput if card is 2x1+
- Card-level setting: show/hide qBittorrent detail (stored in `dashboard_cards` or
  `user_settings`)

### What needs deciding

- **Standalone card vs. Homelab section** — recommendation above is standalone
- **qBittorrent visibility toggle UX** — a setting on the card, a separate card-level
  toggle in the edit bar, or a sub-tab within the card
- **Snapshot frequency** — 30s gives near-real-time; 60s halves the push volume.
  The homelab telemetry contract already pushes every 60s; piggyback or separate?
- **Historical data** — just current snapshot, or store history in D1 for a throughput
  chart? A chart is compelling but adds writes and a migration

### Blockers

- Homelab telemetry integration (Phase 1) should be stable first — this extends the
  same push pipeline
- qBittorrent Web API must be accessible from the collector container (it already runs
  behind Traefik, so this should work)

---

## PL-7: Linear / Trello project card

A dedicated card showing in-progress work and upcoming deadlines across project
management tools — not just notifications, but a board-aware view of current state.

### Scope

- New `CardKey`: `projects` (or `boards` — decide on naming)
- Display: items currently in progress, upcoming deadlines sorted by due date,
  board/workspace label per item
- Multi-account / multi-board support from day one — same pattern as the GitHub card
  (stored as a JSON array of accounts with encrypted tokens)
- Provider support: **Linear** (OAuth 2.0 or API key) and **Trello** (API key + token)
  as launch providers
- Colour-coded by board or workspace so items from different projects are visually
  distinct

### Data model

| Provider | Auth | In-progress items | Deadlines | Free tier |
|---|---|---|---|---|
| **Linear** | OAuth 2.0 or personal API key | Issues in "In Progress" state | Issue due dates | Yes (unlimited personal) |
| **Trello** | API key + user token | Cards in lists marked "doing" / user-configured | Card due dates | Yes (10 boards) |

### What needs building

- `POST /api/projects/accounts` — add/remove provider accounts (encrypted storage)
- `GET /api/projects` — aggregates across all connected accounts, KV cached (5 min TTL)
- Provider services: `services/linear.ts`, `services/trello.ts`
- Settings section: manage connected boards/accounts (Connections tab)
- Component with `useClampList` for the item list; deadlines with colour urgency

### What needs deciding

- **Card naming:** `projects`, `boards`, or `tracker`
- **Which Linear states map to "in progress"** — Linear's workflow states are
  customisable per team. Fetch the workflow and let the user pick, or use a heuristic
  (states in the "started" category)?
- **Trello list mapping** — similar question: which lists count as "in progress"?
  A setting per board, or a naming convention?
- **Overlap with PL-1:** Linear and Trello appear in PL-1 as notification sources.
  The notification feed shows *events* (assigned, mentioned); this card shows *state*
  (what's in progress, what's due). Different concerns, but share auth — wire the same
  provider connection to both

### Blockers

- None hard — can start independently. Shares auth plumbing decisions with PL-1

---

## PL-8: Multi-account calendar + colour-coded events

The calendar system currently supports a single Google account. This extends it to
multiple Google accounts, multiple calendars per account, other providers (Outlook),
and colour-coding events by calendar.

### Scope

- **Multiple Google accounts:** store multiple OAuth connections in `auth_providers`,
  each with its own refresh token. Fetch calendars from all accounts in parallel
  (same pattern as multi-account GitHub)
- **Calendar selection:** each Google account exposes multiple calendars (primary,
  shared, holidays). Let the user pick which calendars to show — stored as a JSON
  setting
- **Colour coding:** each calendar gets a colour (auto-assigned from a palette, user
  can override). Events render with a left-border or dot in their calendar's colour
  so overlapping calendars are distinguishable at a glance
- **Multiple providers:** add Microsoft/Outlook Calendar as a second provider (OAuth
  2.0 via Azure AD). Events from all providers merge into one timeline
- **Multiple email accounts (Gmail):** if PL-1 ships Gmail notification counts, this
  extends the same multi-account pattern — each Google OAuth connection already
  carries scopes, so adding `gmail.readonly` per account is incremental

### What needs building

- Extend `auth_providers` to support multiple rows per provider type per user (it
  already supports this structurally; the query needs to return all, not first)
- Re-consent flow: adding a second Google account means a second OAuth dance — the
  existing `/auth/google` route assumes one connection
- Calendar list endpoint: `GET /api/calendar/calendars` — returns all calendars across
  all connected accounts, with visibility and colour settings
- Settings UI: manage connected accounts (Connections tab), pick visible calendars,
  assign colours (Dashboard tab or inline on the calendar card)
- Merge logic: events from all accounts/calendars sorted by start time, deduplicated
  by event ID (a shared calendar event appears in multiple accounts)
- Frontend: colour indicator per event in both the Today card and Calendar card

### What needs deciding

- **Colour assignment:** auto from a palette (deterministic by calendar ID hash) or
  manual? Auto with override is probably right
- **Outlook priority:** is this needed now, or is multi-Google enough for launch?
  Outlook adds a whole new OAuth provider and token refresh flow
- **Gmail scope interaction:** adding `gmail.readonly` to an existing Google OAuth
  connection requires re-consent. Does this happen per-account or globally?

### Blockers

- The current Google OAuth flow assumes a single connection — refactoring it to
  support multiple is the prerequisite for everything else here
- Outlook requires Azure AD app registration (free, but a new external dependency)

---

## PL-9: Local model insights (homelab experiment)

Replace the rule-based insights engine with actual model inference, running on the
homelab rather than Workers AI — a self-hosted experiment that keeps the free-tier
constraint and adds a real ML capability to the dashboard.

### Concept

The current `GET /insights` endpoint applies hand-written rules to logged data
(correlations, streaks, observations). A local model can generate richer, more
contextual narratives — daily briefings, trend explanations, anomaly detection — using
the same data the rules engine sees.

### Architecture options

| Option | Model host | Inference path | Latency | Cost |
|---|---|---|---|---|
| **Homelab Ollama** | Homelab NAS/server running Ollama | Central Command API calls Ollama over the LAN (or Ollama pushes summaries) | 2–10s depending on model | Free (hardware already owned) |
| **Homelab vLLM** | Same, but vLLM for higher throughput | Same call pattern | Lower per-token | Free, more setup |
| **Workers AI** | Cloudflare edge | Direct from the Worker | Fast | Free tier limited (Phase 2 roadmap item) |

**Recommendation:** start with **Ollama on the homelab**. It runs Llama, Mistral, or
Phi models locally, exposes an OpenAI-compatible API, and costs nothing beyond the
electricity. The Worker calls it through the lab tunnel or the homelab pushes generated
summaries to an ingest endpoint (same pattern as telemetry).

### What needs building

**Homelab side:**
- Ollama container in the homelab compose stack (if not already present)
- A model runner service that receives a prompt (today's data context) and returns
  structured insights
- Push endpoint or pull API accessible from the Central Command Worker

**Central Command side:**
- `POST /api/insights/generate` — triggers insight generation (or receives pushed
  results)
- Prompt engineering: assemble the day's data (calendar density, sleep quality, fitness,
  game performance, notifications) into a context window
- Storage: generated insights in D1 with a TTL (regenerate daily or on-demand)
- Frontend: render model-generated narrative alongside or replacing rule-based insights
- Fallback: if the homelab model is unreachable, fall back to rule-based insights

### What needs deciding

- **Push vs. pull:** does the Worker call Ollama (requires the homelab to be reachable
  from the internet — already true via the lab tunnel), or does a homelab cron job
  generate insights and push them? Push is simpler and doesn't require the Worker to
  wait on inference
- **Model choice:** Llama 3.1 8B is a good starting point for structured output;
  Mistral 7B is lighter. Depends on homelab hardware
- **Prompt structure:** what data goes into the context? All pillars, or just the ones
  with activity today?
- **How this relates to Workers AI (Phase 2):** this experiment validates the insight
  quality. If it works well, Workers AI becomes the production path (lower latency,
  no homelab dependency); if the homelab is enough, skip Workers AI

### Blockers

- Homelab must have enough compute for inference (GPU preferred, CPU possible with
  smaller models)
- The homelab tunnel / networking must be stable enough for the Worker to call or for
  push to be reliable
- Cross-project work: Ollama setup is in the `homelab` repo

---

## Sequencing

```
PL-1 (external notif sources)
  ├─► PL-2 (Trailhead card — once Trailhead is stable)
  └─► PWA (service worker + push)
        └─► PL-5 (Tauri, if PWA is not enough)

PL-7 (Linear/Trello card) — shares auth decisions with PL-1, can start independently
PL-8 (multi-account calendar) — independent, large scope
PL-9 (local model insights) — independent, cross-project with homelab
PL-6 (network usage) — depends on homelab telemetry being stable
PL-3 (health external) — independent, start when a device is available
PL-4 (notes/capture) — independent, needs a product decision first
```
