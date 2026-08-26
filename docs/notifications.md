# Notifications — the spine

**Status:** Slot 1 shipped (spine + route + card). Producers: the homelab ntfy relay.
Everything else on this page is designed-for, not built.
**Owns:** every decision about how notifications are stored, counted, acted on and
delivered. Layout decisions belong to [`ui-suite.md`](ui-suite.md); the homelab wire
contract belongs to [`../../integrations/homelab-telemetry.md`](../../integrations/homelab-telemetry.md).

---

## Why this is a spine and not a card

The Notifications card is the first *reader* of this data, not its owner. The design
premise — recorded as the "Zero Inbox" direction — is that everything unread in the
estate should land in one place and be driven to zero: homelab alerts, unread mail,
unread messages, later Linear and Trello. And that the same rows should feed every
delivery channel: the card today, web push and native OS toasts from a desktop shell
later.

Both of those fail if notifications are stored per-source:

- a table per source makes **each new source a migration**, and
- a fan-in query per channel makes **each new channel touch every source**.

So there is one table, `notifications`, and a `source` discriminator that is plain TEXT
with no `CHECK` constraint. Adding Gmail is a collector; it is not a schema change.

## D1 — Feeds and counts are different, and both are first-class

This is the decision most likely to be re-derived incorrectly later, so it is first.

"All ntfy notifications from the homelab" is a **feed**: real rows, each one actionable
individually — read it, dismiss it, snooze it. "Unread emails: 12" is a **counter**.
Gmail is never going to write four thousand rows into this table, and a card built on the
assumption that every source is a feed gets rebuilt the day Gmail lands.

So there are two tables:

| Table | Holds | Written by |
|---|---|---|
| `notifications` | Feed rows | Any producer with discrete events |
| `notification_sources` | One row per `(user, source)`: label, `unread_count`, `last_event_at`, `state` | Every producer, feed or count |

**`notification_sources.unread_count` is nullable, and the null is meaningful:**

- `NULL` → *derive the count from the feed*. This is what `lab` does.
- a number → *the collector reported it*. This is what Gmail and Slack will do.

`readNotifications()` COALESCEs the two in that order, so the card renders one badge per
source and never needs to know which kind it is looking at. A count-only source simply
contributes no rows to the list.

## D2 — Idempotency is the producer's id, not our trust in the stream

`UNIQUE(user_id, source, external_id)`, and every ingest is insert-or-ignore.

ntfy delivery is at-least-once across reconnects — the homelab agent resumes with
`since=<last id>` and will legitimately re-send events it already sent — so deduping in
the consumer is not defensive coding, it is the normal path. The ingest response reports
`{accepted, duplicates}` precisely so the agent can notice its cursor has stopped
advancing.

Scoped by `user_id` as well as `source` because two users' labs are two independent
streams that may reuse message ids.

## D3 — Sanitise at the choke point, not at each route

Notification text is **untrusted data, never instructions**. It is typed by whoever
configured the service that emitted it, rendered as text, never interpolated anywhere
executable, and **excluded from the Insights card**. If a Workers AI narrative ever
consumes it, it must be fenced and labelled — the same rule Trailhead applies to ticket
text.

`sanitiseText()` / `sanitiseTags()` (in `packages/utils`) strip control characters and
cap length, and they are applied inside `appendNotifications()` rather than in each
route. That is deliberate: the service is the choke point every producer passes through,
so a collector added later gets the treatment without anyone remembering to ask for it.

Control characters are filtered **by code point, not by a regex character class**. A
class of control characters is written with escapes that survive exactly as long as
nothing reformats the file, and when they break the regex still compiles — it just stops
matching. Comparing numbers cannot degrade silently.

Caps: title 200, body 2,000, 10 tags of 40, 100 events per batch. Over-cap values are
**truncated, not rejected** — an over-long title is a chatty config, and dropping the
alert over it would be the wrong trade.

## D4 — Unread rows are never pruned

`runNotificationPrune` deletes **read and dismissed** rows older than 30 days. Age alone
is never enough. A notification nobody has seen disappearing on a timer is the exact
failure this feature exists to prevent; the count is meant to be driven to zero by a
person.

## D5 — The card's fit strategy, decided before the card was written

Under [`ui-suite.md`](ui-suite.md) D10 a card must fit its tile in both axes. Every card
that decided *how* after being built needed a fix, so:

| Part | Behaviour |
|---|---|
| Source badge row | **Never drops.** The headline, and the only content that is always true — an empty feed still has counts. |
| "Mark all read" | **Never drops.** A submit you cannot reach is a functional failure, not a cosmetic one. |
| The feed | Clamps with `useClampList` + `ClippedNote`. This is the open-ended part. |
| Empty state | Replaces the list. Zero Inbox reached is the *goal* state and should read as achieved, not as a blank area. |

The button is **disabled rather than hidden** at zero unread, so the control does not
move as the feed drains under the pointer.

## Storage shape

```
notifications
  id            TEXT PK (UUID v7)
  user_id       TEXT → users.id
  source        TEXT      -- 'lab' | 'gmail' | 'slack' | … (no CHECK, on purpose)
  kind          TEXT      -- source-specific: 'alert' | 'mention' | …
  external_id   TEXT      -- producer's own id; the dedup key. Nullable.
  title/body/link
  priority      INTEGER   -- ntfy's 1–5, carried through rather than remapped
  tags          TEXT      -- JSON string[]
  published_at  INTEGER
  status        TEXT      -- 'unread' | 'read' | 'dismissed'
  snooze_until  INTEGER   -- column ships, no UI yet (see below)
  read_at, created_at
  UNIQUE (user_id, source, external_id)
  INDEX  (user_id, status, published_at)   -- the card's only read

notification_sources
  PK (user_id, source), label, unread_count (nullable — see D1),
  last_event_at, last_sync_at, state ('ok'|'stale'|'error'), updated_at
```

Migration `0018_notifications.sql`.

**`snooze_until` ships as a column with no control behind it.** Snooze is in the recorded
design, the column costs nothing now, and adding it later is a migration. The PATCH route
accepts and stores it for the same reason.

## API

| Route | Guard | Notes |
|---|---|---|
| `GET /api/notifications` | session | Badges + unread feed (capped 50) + `totalUnread` |
| `PATCH /api/notifications/:id` | session | `{status, snoozeUntil?}`. Scoped by user, so another account's id is a 404 |
| `POST /api/notifications/read-all` | session | Optional `{source}` |

Writes need no demo handling of their own — `demoReadOnly` blocks every non-GET first.

Lab events arrive via `POST /api/lab/events`, which is a **lab adapter into this spine**,
not a notifications route: it authenticates with a lab source token outside the session
guard, validates the ntfy topic against a server-side allowlist, and then calls
`appendNotifications()` like any other producer would.

## Build order

1. ✅ **Spine + route + card** — this document.
2. **Pillar collectors** — calendar/tasks/gaming/weather feeding the same table.
3. **Web push** — service worker + VAPID. New dependency, needs approval.
4. **Desktop shell** — Tauri, `apps/desktop`, native OS toasts and a tray. Rust toolchain
   is a new dependency, needs approval.
5. **Gmail** — extends the existing Google OAuth with `gmail.readonly`. A **restricted**
   scope: it raises the verification bar if the app goes public, which interacts with the
   open Cloudflare Access demo-mode reminder. Count-only source (D1).
6. **Slack / Linear / Trello** — webhook sniffers. Count or feed per source.

## Open

- [ ] Whether snooze gets a control, and where — a per-row menu is more UI than the card
      has room for at `1x1`.
- [ ] Whether the badge row should be clickable to filter the feed by source. Cheap, but
      it is a second interaction on a card whose primary gesture is "clear".
- [ ] `state: 'stale'` is written by nothing yet. A collector that stops reporting should
      set it — the same silence-is-not-health rule the Homelab card's freshness band
      enforces, one level down.
- [ ] Whether either new card should join the built-in `focus` preset. Deferred
      deliberately; see `ui-suite.md` and the homelab contract's D11(f).
