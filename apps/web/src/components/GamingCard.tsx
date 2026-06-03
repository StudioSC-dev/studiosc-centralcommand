import { useState } from "react";
import type { GamingData, RankInfo } from "@central-command/types";
import { Card } from "./Card";
import { useConnectRiot, useGaming, useRefreshRiot } from "../lib/gaming";

const REGIONS = ["sg2", "na1", "euw1", "eun1", "kr", "jp1", "br1", "oc1"];

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const rankLabel = (r: RankInfo) => `${r.tier} ${r.division} · ${r.leaguePoints} LP`;

function ConnectForm() {
  const connect = useConnectRiot();
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("sg2");

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
        {REGIONS.map((r) => (
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

function Connected({ data }: { data: GamingData }) {
  const refresh = useRefreshRiot();
  return (
    <>
      <div className="gaming-head">
        <span className="gaming-id">{data.riotId}</span>
        <button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? "…" : "Refresh"}
        </button>
      </div>
      <div className="gaming-ranks">
        {data.ranks.length === 0 && <span className="perf-note">Unranked</span>}
        {data.ranks.map((r) => (
          <div key={r.queueType}>
            <strong>{r.queueType}</strong> {rankLabel(r)} ({r.wins}W/{r.losses}L)
          </div>
        ))}
      </div>
      <p className="gaming-winrate">
        Win rate · 7d {pct(data.winRate7d)} · 30d {pct(data.winRate30d)}
      </p>
      <ul className="gaming-matches">
        {data.matches.slice(0, 8).map((m) => (
          <li key={m.matchId} className={m.win ? "win" : "loss"}>
            <span>{m.champion}</span>
            <span className="gaming-kda">
              {m.kills}/{m.deaths}/{m.assists}
            </span>
            <span className="gaming-score" title="Non-authoritative role-normalized score">
              {m.score}
            </span>
          </li>
        ))}
      </ul>
      <p className="perf-note">Match scores are a non-authoritative demo metric.</p>
    </>
  );
}

export function GamingCard() {
  const { data, isPending, isError, error } = useGaming();

  return (
    <Card title="Gaming" pillar="gaming">
      {isPending && <p>Loading…</p>}
      {isError && <p className="log-error">{error.message}</p>}
      {data && !data.connected && <ConnectForm />}
      {data && data.connected && <Connected data={data} />}
    </Card>
  );
}
