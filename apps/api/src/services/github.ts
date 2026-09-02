import type { GitHubActivityItem } from "@central-command/types";

/**
 * GitHub activity — fetches recent commits, open PRs, and review requests
 * using the GitHub REST API v3 (GraphQL would be more efficient but adds
 * complexity for a single-user dashboard).
 */

const API_BASE = "https://api.github.com";

interface GitHubCommitEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: { commits?: { sha: string; message: string }[] };
  created_at: string;
}

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  head: { repo: { full_name: string } | null };
  draft: boolean;
  requested_reviewers?: { login: string }[];
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Fetch recent GitHub activity for the authenticated user. */
export async function fetchGitHubActivity(token: string): Promise<GitHubActivityItem[]> {
  const [events, prs] = await Promise.all([
    githubFetch<GitHubCommitEvent[]>("/user/events?per_page=30", token),
    githubFetch<GitHubPR[]>("/user/issues?filter=created&state=open&per_page=20&pulls=true", token)
      .catch(() => [] as GitHubPR[]),
  ]);

  const items: GitHubActivityItem[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  // Recent push events → commits
  for (const event of events) {
    if (event.type !== "PushEvent" || !event.payload.commits?.length) continue;
    const at = Date.parse(event.created_at);
    if (at < dayAgo) continue;
    const commit = event.payload.commits[event.payload.commits.length - 1];
    if (!commit) continue;
    items.push({
      id: `commit-${commit.sha.slice(0, 8)}`,
      kind: "commit",
      title: commit.message.split("\n")[0] ?? commit.message,
      repo: event.repo.name,
      url: `https://github.com/${event.repo.name}/commit/${commit.sha}`,
      at,
    });
  }

  // Open PRs by the user
  for (const pr of prs) {
    const repo = pr.head.repo?.full_name ?? "unknown";
    items.push({
      id: `pr-${pr.id}`,
      kind: "pr",
      title: pr.title,
      repo,
      url: pr.html_url,
      state: pr.draft ? "draft" : pr.state,
      at: Date.parse(pr.updated_at),
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, 20);
}
