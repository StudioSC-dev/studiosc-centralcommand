const SLACK_API = "https://slack.com/api";

interface SlackConversation {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  unread_count_display?: number;
}

interface ConversationsListResponse {
  ok: boolean;
  error?: string;
  channels?: SlackConversation[];
  response_metadata?: { next_cursor?: string };
}

interface AuthTestResponse {
  ok: boolean;
  error?: string;
  team?: string;
  user?: string;
}

async function slackGet<T>(token: string, method: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SLACK_API}/${method}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Slack API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSlackUnreadCount(token: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      types: "public_channel,private_channel,im,mpim",
      exclude_archived: "true",
      limit: "200",
    };
    if (cursor) params.cursor = cursor;

    const res = await slackGet<ConversationsListResponse>(token, "conversations.list", params);

    if (!res.ok) {
      throw new Error(`Slack conversations.list: ${res.error ?? "unknown error"}`);
    }

    for (const ch of res.channels ?? []) {
      total += ch.unread_count_display ?? 0;
    }

    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return total;
}

export async function validateSlackToken(
  token: string,
): Promise<{ valid: boolean; team?: string; user?: string }> {
  try {
    const res = await slackGet<AuthTestResponse>(token, "auth.test");
    if (res.ok) {
      return { valid: true, team: res.team, user: res.user };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}
