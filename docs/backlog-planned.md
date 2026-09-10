# Backlog — Planned work

Items that need design, cross-project coordination, or are large enough to span
multiple sessions. Each section captures what is already designed-for, what is open,
and what blocks starting.

**Last updated:** 2026-09-11

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
and recent completed PRs. That card is separate from, and still unscheduled relative
to, the inbox feed below.

### Inbox feed — locally built and verified, not deployed

Contract: `../integrations/trailhead-inbox.md` (supersedes the `trailhead-status.md`
path this section used to cite — no such file was written). Trailhead's `gate.ready`
and similar events push into the notifications spine as `source = 'trailhead'`, the
same shape as the lab/Linear/Slack/Trello producers — see `docs/notifications.md` D6
for the `ingest_sources` credential table this uses.

- **Trailhead side:** the notifier's `centralcommand` channel adapter, `notifier_cursors`
  table, and routing-matrix column are built (contract History).
- **Central Command side:** `POST /api/trailhead/events`, the `ingest_sources` table,
  mint/rotate/revoke routes, and the stale-state exemption are built and verified
  against a local D1 + curl matrix.
- **Deferred, not started:** Cloudflare Access bypass + WAF coverage for the new path,
  applying migration `0031` to remote D1, minting the real token into remote
  `ingest_sources`, and setting `TRAILHEAD_CC_INGEST_URL` / `TRAILHEAD_CC_TOKEN` on the
  Trailhead side before recreating the notifier. The channel is inert until all of
  that happens.

### Dedicated status card — separate, still undecided

Would show live orchestrator state (queue depth, active workers) as its own card,
distinct from the inbox feed above (job events, not live state).

| Data | Shape | Push frequency |
|---|---|---|
| Queue depth (pending jobs) | Snapshot counter | On change |
| Active workers | Snapshot counter | On change |
| Recent completed jobs | Feed (PR link, ticket ref, duration, outcome) | On completion |
| Errors / failed jobs | Feed (error summary, ticket ref) | On failure |

### What needs building (card only — the feed above is done)

- **Contract:** a wire format for the card's snapshot/event push, separate from
  `trailhead-inbox.md` (that contract covers the notifications feed only)
- **Trailhead side:** a status reporter that POSTs snapshots and events to the
  Central Command Worker
- **Central Command side:**
  - D1 table or KV snapshot for queue depth / active workers
  - New `CardKey`: `trailhead`
  - Component: queue depth, active workers, recent jobs list with PR links and
    outcomes, error count
  - Fit strategy: counters never drop, job list clamps

### What needs deciding

- **Whether the card is still wanted now that job events already reach the inbox.**
  The inbox feed covers "a gate needs you"; the card would add "here is live queue
  state" — a different need, not yet prioritized.

### Blockers

- The card's own wire contract must be written and agreed before either side builds
  it — distinct from `trailhead-inbox.md`, which is already agreed and locally built.
- This is cross-project work — each side is a separate commit in a separate repo on
  its own branch.

---

## PL-3: Health card — computed metrics from Apple Health

The health card shifts from manual-entry to a **computed metrics dashboard**. The user
has an Apple Watch Ultra and uses Bevel (Apple Health overlay, no API), FoodNoms
(nutrition, syncs to Apple Health), and Strava (workouts, has API + webhooks). Since
Bevel has no public API, we interpret raw Apple Health data ourselves to produce
equivalent scores.

### Data pipeline

```
Apple Watch → Apple Health ← Bevel (writes recovery/strain/sleep scores)
                           ← FoodNoms (writes nutrition/calories)
                           ← Strava (writes workouts)
         ↓
  Health Auto Export app ($5, REST API push)
    — or Expo app (full control, more work)
         ↓
  POST /api/health/ingest (Central Command)
         ↓
  packages/utils/ scoring functions
         ↓
  Health card: Recovery, Sleep, Strain, Stress, Energy Bank + nutrition
```

### Data bridge options

| Option | Effort | Autonomy | Cost |
|---|---|---|---|
| **Health Auto Export** (iOS app) | Near-zero — configure endpoint + interval | High — auto-push on timer, 150+ metrics, JSON format | $5 one-time |
| **Expo app** (custom) | 2-3 sessions to scaffold | Full — control data shape, timing, retry | Free (no App Store needed for 1-2 users) |
| **iOS Shortcuts** | Low | Low — fragile, no background execution | Free |

**Decision:** start with Health Auto Export for speed. Expo app is the upgrade path if
we outgrow it.

### Computed metrics (Bevel equivalents)

| Metric | Score range | Apple Health inputs |
|---|---|---|
| **Recovery** | 0-100 | Resting HR trend, HRV (SDNN/RMSSD), sleep duration + deep sleep % |
| **Sleep** | 0-100 | Total sleep, sleep stages (deep/REM/light/awake), efficiency, bedtime consistency |
| **Strain** | 0-100 | Active calories, workout duration + type + HR zones, exercise minutes |
| **Stress** | 0-100 | HRV variability (lower = more stressed), resting HR elevation, respiratory rate |
| **Energy Bank** | 0-100 | Rolling balance of Recovery minus Strain over 7-14 days |

Scoring functions live in `packages/utils/` — calibrate against Bevel's scores initially.

### Nutrition integration

**FoodNoms** is the primary calorie/macro tracker. It syncs to Apple Health, so
nutrition data flows through the same bridge — zero extra integration work. FoodNoms
also has a Shortcuts integration (44 actions) and an MCP beta. MyFitnessPal's API has
been closed to new developers since 2019 — not viable.

### Strava

Secondary source for workouts. Has OAuth 2.0 + webhooks (push on activity completion).
Not primary — Apple Health already captures workout data from the Watch — but Strava
adds social metadata (segments, PRs, route maps) that Apple Health doesn't carry.

### What needs building

- `POST /api/health/ingest` — receives Apple Health JSON from the bridge app
- `packages/utils/health-scoring.ts` — Recovery, Sleep, Strain, Stress, Energy Bank
  scoring functions from raw Apple Health data
- Migration: add `source` column (`'manual' | 'apple_health'`) to `fitness_logs`,
  `sleep_logs`, `nutrition_logs`
- Merge rule: external data wins by default, manual entry overrides
- KV cache with appropriate TTL (health data changes at most daily)
- Health card component redesign: metric gauges/rings instead of log entry forms
- Manual entry stays as fallback for untracked activities
- (Later) Strava OAuth + webhook listener for enriched workout data

### What needs deciding

- **Health Auto Export vs. Expo app** — decided: Health Auto Export first
- **Scoring calibration** — how closely do we need to match Bevel? Good enough vs.
  exact. Recommend good enough (same directional signals, not pixel-identical numbers)
- **Card layout** — five metric rings/gauges, or a prioritised list? The card needs to
  show Recovery + Sleep + Strain at minimum; Stress and Energy Bank can shed via
  `useFitSections`

### Blockers

- Health Auto Export must be purchased and configured on the user's iPhone
- Ingest endpoint must handle the specific JSON shape Health Auto Export sends
- Scoring functions need initial calibration data (a week of parallel Bevel + raw data)

---

## PL-4: Tasks — Google Tasks sync (mobile access)

The Tasks card is native D1-backed. The goal is not a new card or capture surface —
it's **bidirectional sync with Google Tasks** so tasks are visible and editable on the
user's phone when away from the dashboard.

### Why Google Tasks

- Reuses existing Google OAuth (add `tasks` scope on re-consent)
- Native iOS app; also visible in Gmail and Google Calendar on any device
- Free, stable API with full CRUD
- "Remind me" from Google Assistant lands in Google Tasks automatically

### Sync model

D1 tasks remain the source of truth. Google Tasks is a mirror.

| Action in CC | Effect on Google Tasks |
|---|---|
| Create task | Push to Google Tasks API |
| Complete/uncomplete | Update status on Google Tasks |
| Delete task | Delete from Google Tasks |
| Edit title/notes | Update on Google Tasks |

| Action on phone (Google Tasks) | Effect in CC |
|---|---|
| Create task | Pull into D1 on next sync |
| Complete/delete/edit | Pull changes into D1 on next sync |

Sync runs on the existing cron cadence or on-demand when the Tasks card loads.
Conflict resolution: last-write-wins by timestamp.

### What needs building

- Add `tasks` scope to Google OAuth re-consent flow
- Migration: add `external_id` (Google Tasks task ID) and `source` (`'native' |
  'google_tasks'`) columns to `tasks` table
- `services/google-tasks.ts` — CRUD wrapper around Google Tasks API
- Sync service: push local changes, pull remote changes, dedup on `external_id`
- KV cache for task list (short TTL, same pattern as calendar)
- Settings: "Connect Google Tasks" toggle in Connections tab (uses existing Google
  OAuth, just adds the scope)

### What needs deciding

- **Which Google Tasks list to sync** — default list only, or let user pick?
  Recommend default list only for simplicity
- **Sync frequency** — on card load + cron (every 5 min?), or just on card load?
  On-load is simpler; cron keeps the phone in sync faster when tasks are created in CC
- **Scope upgrade UX** — adding `tasks` scope requires re-consent. Same flow as
  PL-8's multi-account re-consent. Handle gracefully (redirect to Google, come back)

### Blockers

- Adding `tasks` scope triggers a new Google consent screen — same concern as PL-1's
  Gmail scope. For single-user, this is fine. For demo mode, the scope list grows

---

## PL-5: PWA — installable app + push notifications

Ship a Progressive Web App. Tauri is deferred indefinitely — PWA covers the need.

### What it delivers

- **Installable** on desktop (Windows, Mac, Linux) and mobile (iOS, Android)
- **Push notifications** via Web Push API (service worker + VAPID keys) — fed by
  the notification spine
- **Offline shell** with cached assets (service worker precache)
- No new build toolchain, no new language, no app store

### What needs building

- `apps/web/public/manifest.json` — app name, icons, theme colour, `display: standalone`
- Service worker (Vite PWA plugin or hand-rolled) — asset precache + push handler
- VAPID key pair generation + storage (Worker env vars)
- `POST /api/push/subscribe` — stores push subscription per user in D1
- Push dispatch: when the notification spine writes a new row, fire a web push to
  all subscriptions for that user
- App icons in multiple sizes (192, 512, maskable)

### What needs deciding

- **Vite PWA plugin vs. hand-rolled service worker** — plugin (`vite-plugin-pwa`) is
  simpler for precaching; hand-rolled gives more control over push handling. Recommend
  plugin with a custom push handler
- **Push trigger** — on every notification row insert, or batched? Every insert is
  simpler and more immediate
- **Offline behaviour** — cache-first for the shell, network-first for API data?
  Standard pattern: precache the app shell, let API calls fail gracefully offline

### Blockers

- The notification spine should have at least one external source (PL-1) feeding it
  before push is meaningful — otherwise push notifies about nothing
- VAPID keys are a new secret to manage (Worker env var, not KV)
- `vite-plugin-pwa` is a new dependency — needs approval when we start

---

## PL-6: Homelab card redesign — tiled layout + network

The Homelab card becomes a **mini Central Command for the homelab** — a tiled layout
where each concern gets its own tile instead of a flat list of rows. Network usage
(including qBittorrent globals) is a new tile within this redesign, not a standalone
card.

### Tile layout

| Tile | Data | Source |
|---|---|---|
| **Services** | Service health rows (existing) | lab-agent push (already live) |
| **Docker** | Container count, running/stopped, resource usage | lab-agent push (extend payload) |
| **Network** | Aggregate up/down throughput | System-level (`/proc/net/dev` or `vnstat`) |
| **qBittorrent** | Global up/down rate, total ratio, active count | qBit Web API (`/api/v2/transfer/info`) |
| **Storage** | Disk usage per volume/mount | lab-agent push (extend payload) |
| **Backups** | Last backup time, status (existing `data-drop-order` section) | lab-agent push (already live) |

Tiles are compact — icon + 1-3 key numbers. The card uses a CSS grid within itself
(2-3 columns depending on card size), with `useFitSections` shedding lower-priority
tiles when the card is small.

### What needs building

**Homelab side (`homelab` repo):**
- Extend lab-agent payload to include network stats + qBittorrent globals + storage
  usage + Docker summary
- qBittorrent collector: reads `/api/v2/transfer/info` for global rates (total DL/UL
  speed, session ratio, active torrent count — no per-torrent detail)
- Network collector: reads system-level throughput
- Contract update: `../integrations/homelab-telemetry.md` — add new fields to the
  push schema

**Central Command side:**
- Redesign `HomelabCard.tsx` from flat row list to tiled grid
- Each tile is a small component: icon, label, 1-3 values
- `useFitSections` with `data-drop-order` on tiles (services + network always show;
  storage, backups, qBit shed first)
- Extend KV snapshot schema to store the new fields
- No new `CardKey` — stays as `lab`

### What needs deciding

- **Tile priority order** — which tiles shed first when the card is small?
  Recommend: services + network always visible; Docker, qBit, storage, backups shed
  in that order
- **Snapshot frequency** — piggyback on existing 60s push (add fields to same payload)
  or separate push for network (higher frequency)?  Recommend piggyback on 60s
- **Historical data** — just current snapshot per tile, or store history for sparklines?
  Recommend snapshot-only for v1; sparklines are a v2 enhancement

### Blockers

- Homelab telemetry pipeline must remain stable — this extends it, not replaces it
- qBittorrent Web API must be accessible from the lab-agent container
- Contract update is cross-project work

---

## PL-7: Urgent tickets card (Linear / Trello)

A **priority-filtered attention surface** — not a board view, but "what needs your
attention right now" across Linear and Trello. Items surface based on a computed
urgency score combining priority level and due date proximity.

### Urgency model

| Priority | Due date | Surfaces? |
|---|---|---|
| Urgent/High | Any (or none) | Always — high-priority items show regardless of deadline |
| Medium | ≤ 3 days out | Yes — approaching deadline elevates it |
| Medium | > 3 days out | No — not urgent yet |
| Low | ≤ 1 day out | Yes — about to be late |
| Low | > 1 day out | No — defer or push the due date |

The card sorts by urgency score (descending), not by due date. A high-priority item
with no due date ranks above a low-priority item due tomorrow.

Urgency thresholds are configurable in `user_settings` (e.g. medium surfaces at 5 days
instead of 3).

### Scope

- New `CardKey`: `tickets`
- Multi-account from day one — same encrypted JSON blob pattern as GitHub card
- Provider support: **Linear** (personal API key or OAuth) and **Trello** (API key +
  token) as launch providers
- Colour-coded by project/board so items from different workspaces are distinguishable
- Shares auth with PL-1 (notifications) — same provider connection feeds both. PL-1
  shows events (assigned, mentioned); this card shows filtered state (what's urgent)

### Data model

| Provider | Auth | Items fetched | Urgency inputs | Free tier |
|---|---|---|---|---|
| **Linear** | Personal API key or OAuth 2.0 | Assigned issues in started states | Priority field (1-4) + due date | Yes |
| **Trello** | API key + user token | Cards assigned to user | Label/priority + due date | Yes (10 boards) |

### What needs building

- `POST /api/tickets/accounts` — add/remove provider accounts (encrypted storage)
- `GET /api/tickets` — fetch assigned items, compute urgency scores, return sorted
  list. KV cached (5 min TTL)
- `packages/utils/urgency.ts` — urgency scoring function (priority × due date proximity)
- Provider services: `services/linear.ts`, `services/trello.ts`
- Settings: manage connected accounts (Connections tab), urgency thresholds (optional)
- Component with `useClampList` — each item shows title, project/board label, priority
  indicator, due date (if set), colour stripe by source

### What needs deciding

- **Urgency thresholds** — the table above is a starting point. Tune after real usage
- **Zero-state** — when nothing is urgent, show "All clear" or hide the card entirely?
  Recommend "All clear" message — the card staying visible is itself information
- **Actions from the card** — link to the ticket in Linear/Trello? Snooze an item
  (push it off the urgent list for N hours)? Recommend link-only for v1

### Blockers

- Shares auth plumbing with PL-1 — can start independently but the provider connection
  pattern should be consistent across both

---

## PL-8: Multi-account Google Calendar + colour-coded events

The calendar supports one Google account. The user has 3 Gmail accounts that all need
their calendars visible. Outlook support deferred to a future pass.

### Auth pattern

`auth_providers` has composite PK `(userId, provider)` — structurally one account per
provider type. Two options:

| Approach | Pros | Cons |
|---|---|---|
| **GitHub pattern** — encrypted JSON blob in `user_settings.google_accounts` | Proven in codebase, no schema change, stores N accounts | Bypasses `auth_providers` for a second pattern; token refresh logic moves |
| **Extend `auth_providers`** — add `account_id` column, new composite PK `(userId, provider, account_id)` | Clean, one pattern for all providers | Migration touches existing rows; OAuth flow refactor |

**Decision needed at build time**, but leaning GitHub pattern — it's already working
for multi-account GitHub and avoids migrating the existing Google OAuth row.

### Scope

- **3 Google accounts**, each with its own OAuth connection + refresh token
- **Calendar selection** per account — each Google account exposes multiple calendars
  (primary, shared, holidays). User picks which to show. Stored as JSON in
  `user_settings.calendar_config`
- **Colour coding** — each calendar gets a colour, auto-assigned from a palette
  (deterministic by calendar ID hash), user can override. Events render with a
  left-border or dot in their calendar's colour
- **Merged timeline** — events from all accounts/calendars sorted by start time,
  deduplicated by event ID (shared calendar events appear in multiple accounts)

### What needs building

- Multi-account Google OAuth storage (GitHub pattern or `auth_providers` extension)
- OAuth flow refactor: `/auth/google` currently upserts on `(userId, 'google')` —
  needs to support "add another account" without overwriting the first
- `GET /api/calendar/calendars` — returns all calendars across all connected accounts,
  with visibility and colour settings
- `GET /api/calendar` refactor — fetch from all accounts in parallel, merge + dedup
- Settings UI: manage connected Google accounts (Connections tab), pick visible
  calendars per account, assign/override colours
- Frontend: colour indicator per event in Today card and Calendar card
- KV cache keyed per account (parallel fetch, separate TTLs)

### What needs deciding

- **Auth storage pattern** — GitHub-style JSON blob vs. `auth_providers` extension.
  Recommend GitHub pattern for consistency
- **Colour palette** — how many colours before they repeat? 8-10 distinguishable
  colours is standard. Auto-assign from palette, override in settings
- **Gmail scope interaction** — if PL-1 ships Gmail notification counts, adding
  `gmail.readonly` per account is incremental since each account already has its own
  OAuth token. Defer to PL-1 implementation

### Blockers

- The existing `/auth/google` route assumes single connection — refactoring it is the
  prerequisite for everything else
- Each "add account" triggers a full Google OAuth consent screen — UX needs to be
  clear about which account is being added
- Dedup logic for shared calendar events needs testing with real data (same event
  across 2 of 3 accounts)

---

## PL-9: Local model insights (homelab via Hermes)

Replace the rule-based insights engine with actual model inference running on the
homelab. Keeps the free-tier constraint and adds real ML capability to the dashboard.
**Hermes** (homelab orchestrator) owns hardware selection, model choice, and Ollama
infra — Central Command owns prompt assembly and result rendering.

### Architecture — pull model

The Worker assembles a prompt from the day's data, sends it to Ollama on the homelab
via the lab tunnel, and gets structured insights back. One round trip.

```
Central Command Worker
  → assembles prompt (calendar, sleep, fitness, gaming, notifications)
  → POST to Ollama (OpenAI-compatible API) via lab tunnel
  ← structured JSON response (insights array)
  → stores in D1, renders on Insights card
```

Pull was chosen over push because the Worker already has all the data context — no
need for a two-step dance where CC sends data to the homelab first.

### What needs building

**Hermes / homelab side (owned by Hermes):**
- Ollama container in the homelab compose stack
- Model selection and hardware allocation
- Ollama API accessible via lab tunnel

**Central Command side:**
- Prompt engineering: assemble the day's data (calendar density, sleep quality, fitness
  logs, game performance, notification volume) into a structured prompt
- `GET /insights` refactor — call Ollama, parse structured output, fall back to
  rule-based insights if homelab is unreachable
- D1 storage: cache generated insights with a daily TTL (regenerate on first request
  each day, or on-demand refresh)
- Frontend: render model-generated narrative alongside or replacing rule-based insights
- Contract: `../integrations/hermes-insights.md` — defines the prompt format, expected
  response schema, Ollama endpoint, and timeout behaviour

### What needs deciding

- **Prompt structure** — all pillars every time, or only pillars with activity today?
  Recommend all pillars — absence of data is itself a signal ("no sleep logged" is
  worth noting)
- **Response schema** — structured JSON (array of `{type, title, body, severity}`) or
  freeform markdown? Structured is easier to render and cache
- **Timeout + fallback** — if Ollama doesn't respond within N seconds, fall back to
  rule-based. Recommend 15s timeout
- **How this relates to Workers AI** — this experiment validates insight quality. If
  it works well, Workers AI becomes the production path (lower latency, no homelab
  dependency); if the homelab is enough, skip Workers AI entirely

### Blockers

- Hermes must have Ollama running and accessible via the lab tunnel
- Lab tunnel must be stable for the Worker to reach Ollama on demand
- Cross-project work: contract needed before either side builds

---

## Sequencing

```
PL-1 (external notif sources — Slack, Linear, Trello)
  ├─► PL-2 (Trailhead inbox feed built/verified, not deployed; dedicated card unscheduled)
  ├─► PL-5 (PWA + push notifications — needs spine feeding it)
  └─► PL-7 (urgent tickets card — shares auth with PL-1)

PL-3 (health card — Apple Health bridge + scoring) — independent, device ready
PL-4 (Google Tasks sync) — independent, lightweight
PL-6 (homelab card redesign — tiles + network) — extends homelab telemetry pipeline
PL-8 (multi-account Google Calendar) — independent, large scope
PL-9 (local model insights — Hermes/Ollama) — independent, cross-project with homelab
```
