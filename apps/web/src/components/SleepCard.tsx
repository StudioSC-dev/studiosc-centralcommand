import { useState } from "react";
import { Card } from "./Card";
import { useLogSleep, useSleep } from "../lib/logs";

const fmtDuration = (min: number) => `${Math.floor(min / 60)}h ${min % 60}m`;

export function SleepCard() {
  const { data, isPending } = useSleep();
  const log = useLogSleep();
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (!h) return;
    log.mutate(
      {
        durationMin: Math.round(h * 60),
        quality: quality ? Number(quality) : undefined,
      },
      {
        onSuccess: () => {
          setHours("");
          setQuality("");
        },
      },
    );
  };

  return (
    <Card title="Sleep">
      <form className="log-form" onSubmit={submit}>
        <input type="number" min="0" step="0.5" placeholder="hours" value={hours} onChange={(e) => setHours(e.target.value)} />
        <input type="number" min="1" max="5" placeholder="1-5" value={quality} onChange={(e) => setQuality(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      {isPending ? (
        <p>Loading…</p>
      ) : (
        <ul className="log-list">
          {(data?.entries ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              {e.date ?? ""} · {fmtDuration(e.durationMin ?? 0)}
              {e.quality ? ` · quality ${e.quality}` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
