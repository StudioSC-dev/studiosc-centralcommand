import type { GitHubActivityItem } from "@central-command/types";

const API_BASE = "https://api.github.com";

interface GitHubCommitEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: { commits?: { sha: string; message: string }[] };
  created_at: string;
}

interface GitHubSearchPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  draft: boolean;
  pull_request?: { html_url: string; merged_at: string | null };
  repository_url: string;
}

interface GitHubSearchResponse {
  items: GitHubSearchPR[];
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

export async function fetchGitHubActivity(
  token: string,
  accountLabel?: string,
): Promise<GitHubActivityItem[]> {
  const [events, searchResult] = await Promise.all([
    githubFetch<GitHubCommitEvent[]>("/user/events?per_page=30", token),
    githubFetch<GitHubSearchResponse>(
      "/search/issues?q=is:pr+author:@me+state:open&per_page=20",
      token,
    ).catch(() => ({ items: [] }) as GitHubSearchResponse),
  ]);

  const items: GitHubActivityItem[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

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
      account: accountLabel,
    });
  }

  for (const pr of searchResult.items) {
    const repoFullName = pr.repository_url.replace("https://api.github.com/repos/", "");
    const state = pr.pull_request?.merged_at ? "merged" : pr.draft ? "draft" : pr.state;
    items.push({
      id: `pr-${pr.id}`,
      kind: "pr",
      title: pr.title,
      repo: repoFullName,
      url: pr.html_url,
      state,
      at: Date.parse(pr.updated_at),
      account: accountLabel,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, 20);
}
