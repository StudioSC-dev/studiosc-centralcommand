import type {
  LabMonitor,
  LabSectionResult,
  LabSections,
  Notification,
} from "@central-command/types";
import { useLab } from "../lib/lab";
import { useNow } from "../lib/time";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

/**
 * Homelab — the *state* half of the telemetry integration.
 *
 * Events live on the Notifications card, deliberately: an ntfy alert from the
 * lab is the same kind of thing as an unread mail or a Slack mention, and
 * putting them here would have made one card answer two questions badly.
 *
 * **Fit strategy (ui-suite D10), decided before this card was written.** Every
 * card that skipped that step needed a fix afterwards, so:
 *
 * - The freshness line and the counts row NEVER drop. They are
 *   controls-equivalent — this card's whole reason to exist is saying when the
 *   lab was last heard from, and a version of it that has dropped that is
 *   worse than no card.
 * - A failed section's notice NEVER drops. "Kuma unreachable" is the point of
 *   the section envelope; hiding it would restore exactly the
 *   silence-looks-like-health failure the integration exists to fix.
 * - The **list** is the open-ended part and clamps with `useClampList`.
 * - Backups and image updates are `data-drop-order` blocks, shed first.
 *
 * The list is problems-first and falls back to recent lab events when nothing
 * is wrong. That fallback is not decoration: an all-green lab would otherwise
 * render a near-empty card at the three tall sizes, which is `SLACK` — content
 * dropped while space went unused, the failure mode that survives eyeballing
 * and is why `/layout-lab` reports it.
 */

/** Something worth showing in the list, whatever section it came from. */
interface Problem {
  key: string;
  label: string;
  detail: string;
  tone: "bad" | "warn";
}

const fmtAge = (ms: number): string => {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const fmtSince = (since: string | undefined, now: number): string => {
  if (!since) return "";
  const ms = Date.parse(since);
  return Number.isFinite(ms) ? fmtAge(now - ms) : "";
};

/** Narrow a section to its data, or null when the collector reported a failure. */
function sectionData<T>(section: LabSectionResult<T> | undefined): T | null {
  return section && section.ok ? section.data : null;
}

/** Human wording for a failed collector. Named sections, because "something
 *  failed" is not actionable and this card is meant to be actionable. */
function sectionFailures(sections: LabSections | null): string[] {
  if (!sections) return [];
  const labels: Record<string, string> = {
    monitors: "Uptime Kuma",
    backups: "Backrest",
    images: "Diun",
    containers: "Docker",
  };
  return Object.entries(sections)
    .filter(([, section]) => section && !section.ok)
    .map(([name, section]) => `${labels[name] ?? name} ${(section as { error: string }).error}`);
}

function collectProblems(sections: LabSections | null, now: number): Problem[] {
  if (!sections) return [];
  const problems: Problem[] = [];

  const monitors = sectionData(sections.monitors);
  if (monitors) {
    const broken = monitors.items.filter(
      (item: LabMonitor) => item.status === "down" || item.status === "degraded",
    );
    for (const item of broken) {
      const age = fmtSince(item.since, now);
      problems.push({
        key: `monitor:${item.key}`,
        label: item.label,
        detail: age ? `${item.status} ${age}` : item.status,
        tone: item.status === "down" ? "bad" : "warn",
      });
    }
  }

  const containers = sectionData(sections.containers);
  for (const item of containers?.unhealthy ?? []) {
    problems.push({
      key: `container:${item.key}`,
      label: item.label,
      detail: "unhealthy",
      tone: "warn",
    });
  }

  const backups = sectionData(sections.backups);
  for (const plan of backups?.plans ?? []) {
    if (plan.result === "failed") {
      problems.push({
        key: `backup:${plan.key}`,
        label: plan.label,
        detail: "backup failed",
        tone: "bad",
      });
    }
  }

  return problems;
}

export function HomelabCard() {
  const { data, isPending, isError, error } = useLab();
  const now = useNow(30_000);
  const { ref, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) {
    return (
      <Card title="Homelab" pillar="lab">
        Loading…
      </Card>
    );
  }
  if (isError) {
    return (
      <Card title="Homelab" pillar="lab">
        Homelab unavailable: {error.message}
      </Card>
    );
  }

  if (!data.source) {
    return (
      <Card title="Homelab" pillar="lab">
        <p className="news-empty">
          No lab connected. Mint a source token and point the lab agent at this app.
        </p>
      </Card>
    );
  }

  const { source, snapshot } = data;
  const sections = snapshot?.sections ?? null;
  const failures = sectionFailures(sections);
  const problems = collectProblems(sections, now);
  const monitors = sectionData(sections?.monitors);
  const backups = sectionData(sections?.backups);
  const images = sectionData(sections?.images);

  const age = source.lastSeenAt === null ? "never" : fmtAge(now - source.lastSeenAt);
  const events: Notification[] = data.events;

  return (
    <Card title="Homelab" pillar="lab" className={`lab-${source.freshness}`}>
      {/* Never drops. When the agent goes quiet this is the only true thing on
          the card, and everything below it is history being shown as if it were
          current — which is precisely what the freshness band is warning about. */}
      <p className={`lab-freshness is-${source.freshness}`}>
        <span className="lab-dot" aria-hidden="true" />
        {source.freshness === "fresh"
          ? `Live · updated ${age}`
          : source.freshness === "stale"
            ? `No update for ${age}`
            : `Offline · last seen ${age}`}
      </p>

      {/* Also never drops: counts are the headline, and a card that has shed
          them is answering none of the questions it was added for. */}
      {monitors ? (
        <p className="lab-counts">
          <span className="lab-count is-up">{monitors.counts.up} up</span>
          {monitors.counts.down > 0 && (
            <span className="lab-count is-down">{monitors.counts.down} down</span>
          )}
          {(monitors.counts.degraded ?? 0) > 0 && (
            <span className="lab-count is-warn">{monitors.counts.degraded} degraded</span>
          )}
          {monitors.counts.paused > 0 && (
            <span className="lab-count is-muted">{monitors.counts.paused} paused</span>
          )}
        </p>
      ) : (
        <p className="lab-counts is-unknown">Monitor state unavailable</p>
      )}

      {failures.length > 0 && (
        <p className="lab-failures" title="A collector could not be reached">
          {failures.join(" · ")}
        </p>
      )}

      {/* The open-ended part. Problems first; recent events when all is well, so
          a healthy lab still fills its tile rather than reporting SLACK. */}
      {problems.length > 0 ? (
        <ul className="lab-list" ref={ref}>
          {problems.map((problem) => (
            <li key={problem.key} className={`lab-row tone-${problem.tone}`}>
              <span className="lab-row-label">{problem.label}</span>
              <span className="lab-row-detail">{problem.detail}</span>
            </li>
          ))}
        </ul>
      ) : events.length > 0 ? (
        <ul className="lab-list" ref={ref}>
          {events.map((event) => (
            <li key={event.id} className="lab-row tone-quiet">
              <span className="lab-row-label">{event.title}</span>
              <span className="lab-row-detail">{fmtAge(now - event.publishedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lab-allclear">All services healthy.</p>
      )}

      <ClippedNote count={clippedCount} noun={problems.length > 0 ? "issue" : "event"} />

      {/* Droppable, lowest first. Both are context rather than alarm: a failed
          backup or an unhealthy container has already surfaced in the list above
          as a problem, so shedding these loses nothing actionable. */}
      {images && images.pendingUpdates > 0 && (
        <p className="lab-aside" data-drop-order="1">
          {images.pendingUpdates} image update{images.pendingUpdates === 1 ? "" : "s"} pending
        </p>
      )}
      {backups && backups.plans.length > 0 && (
        <p className="lab-aside" data-drop-order="2">
          {backups.plans.filter((plan) => plan.result === "ok").length}/{backups.plans.length}{" "}
          backups OK
        </p>
      )}
    </Card>
  );
}
