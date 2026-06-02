import { useState } from "react";
import { Card } from "./Card";
import { useFitness, useLogFitness } from "../lib/logs";

export function FitnessCard() {
  const { data, isPending } = useFitness();
  const log = useLogFitness();
  const [activity, setActivity] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [intensity, setIntensity] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Number(durationMin);
    if (!activity.trim() || !mins) return;
    log.mutate(
      {
        activity: activity.trim(),
        durationMin: mins,
        intensity: intensity ? Number(intensity) : undefined,
      },
      {
        onSuccess: () => {
          setActivity("");
          setDurationMin("");
          setIntensity("");
        },
      },
    );
  };

  return (
    <Card title="Fitness">
      <form className="log-form" onSubmit={submit}>
        <input placeholder="activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
        <input type="number" min="1" placeholder="min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        <input type="number" min="1" max="5" placeholder="1-5" value={intensity} onChange={(e) => setIntensity(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      {isPending ? (
        <p>Loading…</p>
      ) : (
        <ul className="log-list">
          {(data?.entries ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              {e.activity} · {e.durationMin}m{e.intensity ? ` · intensity ${e.intensity}` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
