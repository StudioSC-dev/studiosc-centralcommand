import { useState } from "react";
import type { GitHubActivityItem } from "@central-command/types";
import { useGitHubActivity, useSetGitHubToken } from "../lib/github";
import { useNow } from "../lib/time";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

/**
 * GitHub Activity — recent commits, open PRs, and review requests.
 *
 * **Fit strategy:** the activity list clamps with `useClampList`. PRs
 * needing review sort first, then recent commits.
 */

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

function ConnectForm() {
  const setToken = useSetGitHubToken();
  const [pat, setPat] = useState("");

  return (
    <form
      className="gh-connect"
      onSubmit={(e) => {
        e.preventDefault();
        if (pat.trim()) setToken.mutate(pat.trim());
      }}
    >
      <p className="gh-connect-hint">
        Paste a GitHub personal access token to connect.
      </p>
      <input
        type="password"
        className="gh-connect-input"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        placeholder="ghp_..."
      />
      <button
        type="submit"
        className="gh-connect-btn"
        disabled={!pat.trim() || setToken.isPending}
      >
        {setToken.isPending ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}

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
        <ConnectForm />
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
                <span className="gh-row-repo">{item.repo.split("/").pop()}</span>
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
