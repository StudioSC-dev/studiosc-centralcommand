import { Link } from "@tanstack/react-router";
import type { GitHubActivityItem } from "@central-command/types";
import { useGitHubActivity } from "../lib/github";
import { useNow } from "../lib/time";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

const fmtAge = (ms: number): string => {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const kindIcon = (item: GitHubActivityItem): string => {
  if (item.kind === "pr") {
    if (item.state === "merged") return "merged";
    if (item.state === "closed") return "closed";
    return "open";
  }
  return item.kind;
};

export function GitHubCard() {
  const { data, isPending, isError, error } = useGitHubActivity();
  const now = useNow(30_000);
  const { ref, clippedCount } = useClampList<HTMLUListElement>();

  if (isPending) {
    return <Card title="GitHub" pillar="github">Loading…</Card>;
  }
  if (isError) {
    return <Card title="GitHub" pillar="github">GitHub unavailable: {error.message}</Card>;
  }

  if (!data.connected) {
    return (
      <Card title="GitHub" pillar="github">
        <p className="gh-empty">
          <Link to="/settings" className="gh-settings-link">
            Connect a GitHub account in Settings.
          </Link>
        </p>
      </Card>
    );
  }

  const { items } = data;

  return (
    <Card title="GitHub" pillar="github">
      {items.length > 0 ? (
        <ul className="gh-list" ref={ref}>
          {items.map((item) => (
            <li key={item.id} className={`gh-row gh-kind-${kindIcon(item)}`}>
              <span className="gh-row-icon" aria-label={item.kind}>
                {item.kind === "pr" ? "PR" : item.kind === "review" ? "RV" : "C"}
              </span>
              <div className="gh-row-main">
                <a
                  className="gh-row-title"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title}
                </a>
                <span className="gh-row-repo">
                  {item.account && data.accounts && data.accounts.length > 1
                    ? `${item.account} · `
                    : ""}
                  {item.repo.split("/").pop()}
                </span>
              </div>
              <span className="gh-row-age">{fmtAge(now - item.at)}</span>
              {item.ciStatus && (
                <span className={`gh-ci gh-ci-${item.ciStatus}`} title={`CI: ${item.ciStatus}`} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gh-empty">No recent activity.</p>
      )}
      <ClippedNote count={clippedCount} noun="item" />
    </Card>
  );
}
