import type { NotificationInput } from "./notifications";

const GRAPHQL_URL = "https://api.linear.app/graphql";

interface LinearNotificationNode {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  issue: {
    identifier: string;
    title: string;
    url: string;
    state: { name: string } | null;
  } | null;
}

interface LinearNotificationsResponse {
  data?: {
    notifications: {
      nodes: LinearNotificationNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

interface LinearViewerResponse {
  data?: { viewer: { name: string; email: string } };
  errors?: Array<{ message: string }>;
}

async function gql<T>(apiKey: string, query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Linear API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  issueAssignedToYou: "assigned to you",
  issueMention: "mentioned you",
  issueNewComment: "new comment",
  issueCommentMention: "mentioned you in a comment",
  issueStatusChanged: "status changed",
  issuePriorityChanged: "priority changed",
  issueDue: "due soon",
};

function notificationTitle(node: LinearNotificationNode): string {
  const issue = node.issue;
  const prefix = issue ? `${issue.identifier}: ${issue.title}` : "Notification";
  const label = NOTIFICATION_TYPE_LABELS[node.type] ?? node.type;
  return `${prefix} — ${label}`;
}

export async function fetchLinearNotifications(
  apiKey: string,
  accountLabel?: string,
): Promise<NotificationInput[]> {
  const query = `{
    notifications(first: 50, includeArchived: false) {
      nodes {
        id
        type
        createdAt
        readAt
        issue {
          identifier
          title
          url
          state { name }
        }
      }
    }
  }`;

  const res = await gql<LinearNotificationsResponse>(apiKey, query);

  if (res.errors?.length) {
    throw new Error(`Linear GraphQL: ${res.errors[0]!.message}`);
  }

  const nodes = res.data?.notifications.nodes ?? [];
  const inputs: NotificationInput[] = [];

  for (const node of nodes) {
    if (node.readAt) continue;

    inputs.push({
      source: "linear",
      kind: node.type,
      externalId: node.id,
      title: notificationTitle(node),
      body: node.issue?.state?.name ?? null,
      link: node.issue?.url ?? null,
      priority: 3,
      tags: accountLabel ? [accountLabel] : [],
      publishedAt: new Date(node.createdAt).getTime(),
    });
  }

  return inputs;
}

export async function validateLinearApiKey(
  apiKey: string,
): Promise<{ valid: boolean; name?: string; email?: string }> {
  try {
    const res = await gql<LinearViewerResponse>(apiKey, "{ viewer { name email } }");
    if (res.data?.viewer) {
      return { valid: true, name: res.data.viewer.name, email: res.data.viewer.email };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}
