import type { NotificationInput } from "./notifications";

const TRELLO_API = "https://api.trello.com/1";

const ACTIONABLE_TYPES = new Set([
  "addedToCard",
  "mentionedOnCard",
  "cardDueSoon",
  "commentCard",
  "addedMemberToCard",
  "removedFromCard",
  "changeCard",
  "updateCheckItemStateOnCard",
]);

interface TrelloNotification {
  id: string;
  type: string;
  unread: boolean;
  date: string;
  data?: {
    text?: string;
    card?: { id?: string; name?: string; shortLink?: string };
    board?: { id?: string; name?: string; shortLink?: string };
  };
  memberCreator?: { fullName?: string; username?: string };
}

interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
}

async function trelloGet<T>(apiKey: string, token: string, path: string): Promise<T> {
  const url = `${TRELLO_API}${path}${path.includes("?") ? "&" : "?"}key=${apiKey}&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Trello API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTrelloNotifications(
  apiKey: string,
  token: string,
  accountLabel?: string,
): Promise<NotificationInput[]> {
  const raw = await trelloGet<TrelloNotification[]>(
    apiKey,
    token,
    "/members/me/notifications?read_filter=unread&limit=50",
  );

  return raw
    .filter((n) => ACTIONABLE_TYPES.has(n.type))
    .map((n) => {
      const card = n.data?.card;
      const board = n.data?.board;
      const actor = n.memberCreator?.fullName ?? n.memberCreator?.username;

      let title = n.type;
      if (card?.name) {
        title = `${formatType(n.type)}: ${card.name}`;
      }

      let url: string | undefined;
      if (card?.shortLink) {
        url = `https://trello.com/c/${card.shortLink}`;
      }

      return {
        source: "trello" as const,
        externalId: n.id,
        title,
        body: n.data?.text ?? undefined,
        url,
        actor: actor ?? undefined,
        group: board?.name ?? accountLabel,
        publishedAt: new Date(n.date).getTime(),
      };
    });
}

export async function validateTrelloCredentials(
  apiKey: string,
  token: string,
): Promise<{ valid: boolean; fullName?: string; username?: string }> {
  try {
    const member = await trelloGet<TrelloMember>(apiKey, token, "/members/me?fields=fullName,username");
    return { valid: true, fullName: member.fullName, username: member.username };
  } catch {
    return { valid: false };
  }
}

function formatType(type: string): string {
  switch (type) {
    case "addedToCard":
      return "Added to card";
    case "mentionedOnCard":
      return "Mentioned on card";
    case "cardDueSoon":
      return "Card due soon";
    case "commentCard":
      return "Comment";
    case "addedMemberToCard":
      return "Member added";
    case "removedFromCard":
      return "Removed from card";
    case "changeCard":
      return "Card updated";
    case "updateCheckItemStateOnCard":
      return "Checklist updated";
    default:
      return type;
  }
}
