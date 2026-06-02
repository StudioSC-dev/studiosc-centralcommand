/**
 * Riot Games API client (League of Legends).
 *
 * Routing has two axes:
 *   - platform   (summoner-v4, league-v4): na1, euw1, kr, sg2, …
 *   - regional   (account-v1, match-v5):   americas | asia | europe | sea
 *
 * SEA is split: Singapore (sg2) uses `asia` for account-v1 but `sea` for
 * match-v5. The table below encodes that per platform.
 */

export interface RegionRouting {
  platform: string;
  account: string; // account-v1 host (americas | asia | europe)
  match: string; // match-v5 host (americas | asia | europe | sea)
}

const REGIONS: Record<string, RegionRouting> = {
  na1: { platform: "na1", account: "americas", match: "americas" },
  br1: { platform: "br1", account: "americas", match: "americas" },
  la1: { platform: "la1", account: "americas", match: "americas" },
  la2: { platform: "la2", account: "americas", match: "americas" },
  euw1: { platform: "euw1", account: "europe", match: "europe" },
  eun1: { platform: "eun1", account: "europe", match: "europe" },
  tr1: { platform: "tr1", account: "europe", match: "europe" },
  ru: { platform: "ru", account: "europe", match: "europe" },
  kr: { platform: "kr", account: "asia", match: "asia" },
  jp1: { platform: "jp1", account: "asia", match: "asia" },
  // SEA cluster: account-v1 via asia, match-v5 via sea.
  sg2: { platform: "sg2", account: "asia", match: "sea" },
  ph2: { platform: "ph2", account: "asia", match: "sea" },
  th2: { platform: "th2", account: "asia", match: "sea" },
  tw2: { platform: "tw2", account: "asia", match: "sea" },
  vn2: { platform: "vn2", account: "asia", match: "sea" },
  oc1: { platform: "oc1", account: "americas", match: "sea" },
};

export function resolveRegion(platform: string): RegionRouting {
  const region = REGIONS[platform.toLowerCase()];
  if (!region) throw new RiotError(400, `Unsupported region '${platform}'.`);
  return region;
}

export class RiotError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RiotError";
  }
}

async function riotGet<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, { headers: { "X-Riot-Token": apiKey } });
  if (!res.ok) {
    throw new RiotError(res.status, `Riot API ${res.status} at ${new URL(url).pathname}`);
  }
  return (await res.json()) as T;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}
export function getAccountByRiotId(
  gameName: string,
  tagLine: string,
  account: string,
  apiKey: string,
): Promise<AccountDto> {
  const url = `https://${account}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotGet<AccountDto>(url, apiKey);
}

export interface LeagueEntryDto {
  queueType: string; // RANKED_SOLO_5x5 | RANKED_FLEX_SR
  tier: string;
  rank: string; // division I–IV
  leaguePoints: number;
  wins: number;
  losses: number;
}
// league-v4 by-puuid — Riot deprecated the encrypted summonerId, so we key
// ranked lookups off the PUUID directly (no summoner-v4 call needed).
export function getLeagueEntriesByPuuid(
  puuid: string,
  platform: string,
  apiKey: string,
): Promise<LeagueEntryDto[]> {
  const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotGet<LeagueEntryDto[]>(url, apiKey);
}

export function getMatchIds(
  puuid: string,
  match: string,
  apiKey: string,
  count = 20,
): Promise<string[]> {
  const url = `https://${match}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return riotGet<string[]>(url, apiKey);
}

interface MatchParticipant {
  puuid: string;
  championName: string;
  teamPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  challenges?: { killParticipation?: number };
}
interface MatchDto {
  metadata: { matchId: string };
  info: {
    gameStartTimestamp: number;
    gameDuration: number; // seconds
    queueId: number;
    participants: MatchParticipant[];
  };
}

export interface ParsedMatch {
  matchId: string;
  champion: string;
  position: string;
  queueId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  visionScore: number;
  killParticipation: number;
  playedAt: number; // epoch ms
}

/** Fetch a match and extract the given player's participant row. */
export async function getParsedMatch(
  matchId: string,
  puuid: string,
  match: string,
  apiKey: string,
): Promise<ParsedMatch | null> {
  const url = `https://${match}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const dto = await riotGet<MatchDto>(url, apiKey);
  const p = dto.info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;

  return {
    matchId: dto.metadata.matchId,
    champion: p.championName,
    position: p.teamPosition || "UNKNOWN",
    queueId: dto.info.queueId,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.totalMinionsKilled + p.neutralMinionsKilled,
    durationSec: dto.info.gameDuration,
    visionScore: p.visionScore,
    killParticipation: p.challenges?.killParticipation ?? 0,
    playedAt: dto.info.gameStartTimestamp,
  };
}
