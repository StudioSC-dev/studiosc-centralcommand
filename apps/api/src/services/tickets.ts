import type { UrgentTicket } from "@central-command/types";
import { computeUrgency, shouldSurface } from "@central-command/utils";

const LINEAR_API = "https://api.linear.app/graphql";
const TRELLO_API = "https://api.trello.com/1";

interface LinearIssueNode {
  id: string;
  title: string;
  url: string;
  priority: number;
  dueDate: string | null;
  team?: { name?: string };
  project?: { name?: string };
  state?: { type?: string };
}

interface LinearIssuesResponse {
  data?: {
    issues?: {
      nodes?: LinearIssueNode[];
    };
  };
}

const LINEAR_PRIORITY_MAP: Record<number, number> = {
  0: 5, // No priority
  1: 1, // Urgent
  2: 2, // High
  3: 3, // Medium
  4: 4, // Low
};

export async function fetchLinearTickets(apiKey: string): Promise<UrgentTicket[]> {
  const query = `{
    issues(
      filter: {
        assignee: { isMe: { eq: true } }
        state: { type: { in: ["unstarted", "started"] } }
      }
      first: 50
    ) {
      nodes {
        id title url priority dueDate
        team { name }
        project { name }
        state { type }
      }
    }
  }`;

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Linear API ${res.status}`);

  const json = (await res.json()) as LinearIssuesResponse;
  const nodes = json.data?.issues?.nodes ?? [];
  const now = Date.now();

  return nodes.map((n) => {
    const priority = LINEAR_PRIORITY_MAP[n.priority] ?? 5;
    const dueDate = n.dueDate ? new Date(n.dueDate).getTime() : null;

    return {
      id: n.id,
      source: "linear" as const,
      title: n.title,
      url: n.url,
      project: n.project?.name ?? n.team?.name ?? "Linear",
      priority,
      dueDate,
      urgencyScore: computeUrgency(priority, dueDate, now),
    };
  });
}

interface TrelloCard {
  id: string;
  name: string;
  shortLink: string;
  due: string | null;
  labels?: { name: string; color: string }[];
  board?: { name?: string };
}

const TRELLO_PRIORITY_LABELS: Record<string, number> = {
  urgent: 1,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export async function fetchTrelloTickets(
  apiKey: string,
  token: string,
): Promise<UrgentTicket[]> {
  const url = `${TRELLO_API}/members/me/cards?fields=id,name,shortLink,due,labels&board=true&board_fields=name&key=${apiKey}&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trello API ${res.status}`);

  const cards = (await res.json()) as TrelloCard[];
  const now = Date.now();

  return cards.map((c) => {
    const priorityLabel = c.labels?.find((l) =>
      TRELLO_PRIORITY_LABELS[l.name.toLowerCase()] !== undefined,
    );
    const priority = priorityLabel
      ? TRELLO_PRIORITY_LABELS[priorityLabel.name.toLowerCase()]!
      : 3;
    const dueDate = c.due ? new Date(c.due).getTime() : null;

    return {
      id: c.id,
      source: "trello" as const,
      title: c.name,
      url: `https://trello.com/c/${c.shortLink}`,
      project: c.board?.name ?? "Trello",
      priority,
      dueDate,
      urgencyScore: computeUrgency(priority, dueDate, now),
    };
  });
}

export function filterAndSort(tickets: UrgentTicket[]): UrgentTicket[] {
  return tickets
    .filter((t) => shouldSurface(t.urgencyScore))
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}
