import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createDb } from "../lib/db";
import { ok } from "../lib/response";
import { decryptSecret } from "../lib/crypto";
import { getUserSettings } from "../services/users";
import { fetchLinearTickets, fetchTrelloTickets, filterAndSort } from "../services/tickets";
import type { LinearAccount, TrelloAccount, UrgentTicket, UrgentTicketsResponse } from "@central-command/types";

const CACHE_TTL = 5 * 60;

interface StoredLinearAccount {
  id: string;
  label: string;
  apiKey: string;
}

interface StoredTrelloAccount {
  id: string;
  label: string;
  apiKey: string;
  token: string;
}

function parseLinearAccounts(raw: string | null): StoredLinearAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredLinearAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.apiKey === "string",
    );
  } catch {
    return [];
  }
}

function parseTrelloAccounts(raw: string | null): StoredTrelloAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredTrelloAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.id === "string" &&
        typeof a.label === "string" &&
        typeof a.apiKey === "string" &&
        typeof a.token === "string",
    );
  } catch {
    return [];
  }
}

export const tickets = new Hono<AppEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const settings = await getUserSettings(db, userId);

  const linearAccts = parseLinearAccounts(settings?.linearAccounts ?? null);
  const trelloAccts = parseTrelloAccounts(settings?.trelloAccounts ?? null);

  if (linearAccts.length === 0 && trelloAccts.length === 0) {
    const empty: UrgentTicketsResponse = {
      connected: false,
      items: [],
      accounts: { linear: [], trello: [] },
    };
    return ok(c, empty);
  }

  const cacheKey = `tickets:${userId}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) return ok(c, cached);

  const allTickets: UrgentTicket[] = [];
  const linearPublic: LinearAccount[] = [];
  const trelloPublic: TrelloAccount[] = [];

  const linearPromises = linearAccts.map(async (acct) => {
    try {
      const apiKey = await decryptSecret(acct.apiKey, c.env.TOKEN_ENCRYPTION_KEY);
      linearPublic.push({ id: acct.id, label: acct.label });
      const items = await fetchLinearTickets(apiKey);
      allTickets.push(...items);
    } catch {
      // skip failed
    }
  });

  const trelloPromises = trelloAccts.map(async (acct) => {
    try {
      const apiKey = await decryptSecret(acct.apiKey, c.env.TOKEN_ENCRYPTION_KEY);
      const token = await decryptSecret(acct.token, c.env.TOKEN_ENCRYPTION_KEY);
      trelloPublic.push({ id: acct.id, label: acct.label });
      const items = await fetchTrelloTickets(apiKey, token);
      allTickets.push(...items);
    } catch {
      // skip failed
    }
  });

  await Promise.all([...linearPromises, ...trelloPromises]);

  const data: UrgentTicketsResponse = {
    connected: true,
    items: filterAndSort(allTickets),
    accounts: { linear: linearPublic, trello: trelloPublic },
  };

  await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return ok(c, data);
});
