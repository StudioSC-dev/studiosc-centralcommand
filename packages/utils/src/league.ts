/** Coarse League queue categories used by the match-history queue tabs. */
export type LeagueQueue = "solo" | "flex" | "aram" | "normal" | "other";

/**
 * Map a Riot `queueId` (match-v5 / spectator-v5) to a UI queue category.
 * Reference: https://static.developer.riotgames.com/docs/lol/queues.json
 */
export function leagueQueue(queueId: number): LeagueQueue {
  switch (queueId) {
    case 420:
      return "solo"; // Ranked Solo/Duo
    case 440:
      return "flex"; // Ranked Flex SR
    case 450: // ARAM (Howling Abyss)
    case 2400: // ARAM: Mayhem
      return "aram";
    case 400: // Normal Draft Pick
    case 430: // Normal Blind Pick
    case 490: // Normal (Quickplay)
    case 700: // Clash
      return "normal";
    default:
      return "other"; // Arena, URF, bots, rotating modes, …
  }
}
