import { useState } from "react";
import type { GamingData, MatchQueue, MatchSummary, RankInfo } from "@central-command/types";
import { Card } from "./Card";
import { RIOT_REGIONS, useConnectRiot, useGaming, useRefreshRiot } from "../lib/gaming";
import { useProfile } from "../lib/profile";
import { useNow } from "../lib/time";
import { useIsDemo } from "../lib/auth";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Queue tabs — each filters the rank panel + match list to that queue. */
const TABS: { key: MatchQueue; label: string }[] = [
  { key: "solo", label: "Solo/Duo" },
  { key: "flex", label: "Flex" },
  { key: "aram", label: "ARAM" },
  { key: "normal", label: "Normals" },
];

/** Seconds → "m:ss". */
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Ranked win rate from a queue's W/L totals (null when no games). */
const rankWinPct = (r: RankInfo): number | null => {
  const total = r.wins + r.losses;
  return total ? Math.round((r.wins / total) * 100) : null;
};

/** A ranked queue's standing (tier/division/LP + record). */
function RankDetail({ r }: { r: RankInfo }) {
  const wp = rankWinPct(r);
  return (
    <div className="gaming-rank-detail">
      <div className="gaming-rank-main">
        <span className="gaming-rank-tier">
          {r.tier} {r.division}
        </span>
        <span className="gaming-rank-lp">{r.leaguePoints} LP</span>
      </div>
      <div className="gaming-rank-record">
        {r.wins}W {r.losses}L{wp != null && <> · {wp}%</>}
      </div>
    </div>
  );
}

/** Recent-form summary from the visible matches (for queues with no rank). */
function RecentForm({ matches }: { matches: MatchSummary[] }) {
  if (matches.length === 0) {
    return <span className="perf-note">No recent games in this queue.</span>;
  }
  const wins = matches.filter((m) => m.win).length;
  const wp = Math.round((wins / matches.length) * 100);
  return (
    <div className="gaming-rank-detail">
      <span className="gaming-rank-tier gaming-rank-unranked">Unranked</span>
      <div className="gaming-rank-record">
        Recent {wins}W {matches.length - wins}L · {wp}%
      </div>
    </div>
  );
}

/** "● In game" badge with a live, ticking match timer. */
function LiveBadge({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span className="gaming-live" title="Currently in a game">
      <span className="gaming-live-dot" aria-hidden="true" />
      In game · {fmtDuration(elapsed)}
    </span>
  );
}

function Connected({ data }: { data: GamingData }) {
  const refresh = useRefreshRiot();
  const demo = useIsDemo();
  const [tab, setTab] = useState<MatchQueue>("solo");

  const ranked = tab === "solo" || tab === "flex" ? data.ranks.find((r) => r.queueType === tab) : undefined;
  const filtered = data.matches.filter((m) => m.queue === tab);

  return (
    <div className="gaming">
      <div className="gaming-head">
        <span className="gaming-id">{data.riotId}</span>
        {data.live ? (
          <LiveBadge startedAt={data.live.startedAt} />
        ) : (
          !demo && (
            <button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "…" : "Refresh"}
            </button>
          )
        )}
      </div>

      <div className="gaming-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`gaming-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="gaming-rank glass-inset">
        {ranked ? <RankDetail r={ranked} /> : <RecentForm matches={filtered} />}
      </div>

      <div className="gaming-matches-block">
        <div className="gaming-matches-head">
          <span>Recent</span>
          <span className="gaming-form">
            7d {pct(data.winRate7d)} · 30d {pct(data.winRate30d)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="perf-note">No recent games in this queue.</p>
        ) : (
          <ul className="gaming-matches">
            {filtered.slice(0, 6).map((m) => (
              <li key={m.matchId} className={m.win ? "win" : "loss"}>
                <span className="gaming-match-champ">{m.champion}</span>
                <span className="gaming-match-dur">{fmtDuration(m.durationSec)}</span>
                <span className="gaming-kda">
                  {m.kills}/{m.deaths}/{m.assists}
                </span>
                <span className="gaming-score" title="Non-authoritative role-normalized score">
                  {m.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="perf-note">Match scores are a non-authoritative demo metric.</p>
    </div>
  );
}

function ConnectForm() {
  const connect = useConnectRiot();
  const { data: profile } = useProfile();
  // Prefill from the saved profile tag so connecting is one click for returning users.
  const [riotId, setRiotId] = useState(profile?.profile?.riotId ?? "");
  const [region, setRegion] = useState(profile?.profile?.riotRegion ?? "sg2");

  return (
    <form
      className="log-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (riotId.includes("#")) connect.mutate({ riotId: riotId.trim(), region });
      }}
    >
      <input placeholder="Name#TAG" value={riotId} onChange={(e) => setRiotId(e.target.value)} />
      <select value={region} onChange={(e) => setRegion(e.target.value)}>
        {RIOT_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="submit" disabled={connect.isPending}>
        {connect.isPending ? "Connecting…" : "Connect"}
      </button>
      {connect.isError && <p className="log-error">{connect.error.message}</p>}
    </form>
  );
}

export function GamingCard() {
  const { data, isPending, isError, error } = useGaming();
  const demo = useIsDemo();

  // Title reflects the connected game (League is the only Phase 2 game); falls
  // back to the generic pillar name until an account is linked.
  const title = data?.connected ? "League of Legends" : "Gaming";

  return (
    <Card title={title} pillar="gaming">
      {isPending && <p>Loading…</p>}
      {isError && <p className="log-error">{error.message}</p>}
      {data && !data.connected &&
        (demo ? <p className="perf-note">Sign in to connect a Riot account.</p> : <ConnectForm />)}
      {data && data.connected && <Connected data={data} />}
    </Card>
  );
}
