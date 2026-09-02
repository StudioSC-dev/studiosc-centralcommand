import { useState } from "react";
import type { NotificationSourceSummary } from "@central-command/types";
import { useMarkAllRead, useNotifications, useSetNotificationStatus } from "../lib/notifications";
import { useNow } from "../lib/time";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

/**
 * Notifications — the spine, not a pillar.
 *
 * Every source lands in one table and this card renders all of them: ntfy alerts
 * relayed from the homelab today; unread Gmail and Slack counts next; Linear and
 * Trello after that. Web push and the Tauri shell's native toasts read the same
 * rows later, which is why the spine is a table and not a per-source fetch.
 *
 * **Two shapes, one badge row.** A *feed* source writes rows you can act on
 * individually. A *count-only* source reports a number — Gmail is never going to
 * write four thousand rows here. The API resolves both to one `unread` per
 * source so this component does not need to know which it is looking at, and a
 * count-only source simply has no rows in the list below.
 *
 * **Fit strategy (ui-suite D10), decided before the card was written:**
 * - The badge row NEVER drops. It is the headline, and the only content that is
 *   always true — an empty feed still has counts to show.
 * - Tabs NEVER drop. They are part of the badge-level fixed chrome.
 * - "Mark all read" NEVER drops. A submit you cannot reach is a functional
 *   failure, not a cosmetic one.
 * - The feed is the open-ended part and clamps with `useClampList`.
 */

const fmtAge = (ms: number): string => {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/** Priority 4–5 is ntfy's "high"/"max" — the rows worth colouring. */
const toneFor = (priority: number): string =>
  priority >= 5 ? "tone-bad" : priority === 4 ? "tone-warn" : "tone-quiet";

function SourceBadge({ source }: { source: NotificationSourceSummary }) {
  return (
    <span
      className={`notif-badge${source.unread === 0 ? " is-clear" : ""} state-${source.state}`}
      title={source.state === "ok" ? source.label : `${source.label} — ${source.state}`}
    >
      <span className="notif-badge-label">{source.label}</span>
      <span className="notif-badge-count">{source.unread}</span>
    </span>
  );
}

type ActiveTab = "all" | (string & {});

export function NotificationsCard() {
  const { data, isPending, isError, error } = useNotifications();
  const setStatus = useSetNotificationStatus();
  const markAll = useMarkAllRead();
  const now = useNow(30_000);
  const { ref, clippedCount } = useClampList<HTMLUListElement>();
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");

  if (isPending) {
    return (
      <Card title="Notifications" pillar="notifications">
        Loading…
      </Card>
    );
  }
  if (isError) {
    return (
      <Card title="Notifications" pillar="notifications">
        Notifications unavailable: {error.message}
      </Card>
    );
  }

  const { sources, items, totalUnread } = data;

  // Sources that have feed rows — only these get their own tab.
  const sourcesWithRows = new Set(items.map((item) => item.source));
  const tabSources = sources.filter((s) => sourcesWithRows.has(s.source));
  const showTabs = tabSources.length > 1;

  // If the active tab's source disappeared (all items read), fall back to "all".
  const tab = activeTab !== "all" && !sourcesWithRows.has(activeTab) ? "all" : activeTab;

  const filteredItems = tab === "all" ? items : items.filter((item) => item.source === tab);

  const activeSource = tab !== "all" ? sources.find((s) => s.source === tab) : undefined;
  const markReadLabel = activeSource ? `Mark ${activeSource.label} read` : "Mark all read";
  const markReadCount = tab === "all" ? totalUnread : (activeSource?.unread ?? 0);

  return (
    <Card title="Notifications" pillar="notifications">
      {sources.length > 0 ? (
        <div className="notif-badges">
          {sources.map((source) => (
            <SourceBadge key={source.source} source={source} />
          ))}
        </div>
      ) : (
        <p className="notif-badges is-empty">No sources connected yet.</p>
      )}

      {showTabs && (
        <div className="notif-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`notif-tab${tab === "all" ? " is-active" : ""}`}
            aria-selected={tab === "all"}
            onClick={() => setActiveTab("all")}
          >
            All
          </button>
          {tabSources.map((source) => (
            <button
              type="button"
              role="tab"
              key={source.source}
              className={`notif-tab${tab === source.source ? " is-active" : ""}`}
              aria-selected={tab === source.source}
              onClick={() => setActiveTab(source.source)}
            >
              {source.label}
              {source.unread > 0 && (
                <span className="notif-tab-badge">{source.unread}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {filteredItems.length > 0 ? (
        <ul className="notif-list" ref={ref}>
          {filteredItems.map((item) => (
            <li key={item.id} className={`notif-row ${toneFor(item.priority)}`}>
              <div className="notif-row-main">
                <span className="notif-row-title">{item.title}</span>
                {item.body && <span className="notif-row-body">{item.body}</span>}
              </div>
              <span className="notif-row-age">{fmtAge(now - item.publishedAt)}</span>
              <button
                type="button"
                className="notif-row-clear"
                onClick={() => setStatus.mutate({ id: item.id, status: "read" })}
                aria-label={`Mark "${item.title}" as read`}
                title="Mark read"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="5 13 10 18 19 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notif-empty">Nothing unread.</p>
      )}

      <ClippedNote count={clippedCount} noun="notification" />

      <div className="notif-actions">
        <button
          type="button"
          className="notif-mark-read"
          onClick={() => markAll.mutate(tab === "all" ? undefined : tab)}
          disabled={markReadCount === 0 || markAll.isPending}
          title={markReadLabel}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="5 13 10 18 19 7" />
          </svg>
          {markReadLabel}
        </button>
      </div>
    </Card>
  );
}
