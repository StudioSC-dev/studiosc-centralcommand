import { useState } from "react";
import { Card } from "./Card";
import {
  useFitness,
  useLogFitness,
  useLogNutrition,
  useLogSleep,
  useNutrition,
  useSleep,
} from "../lib/logs";
import { isSameLocalDay } from "../lib/time";

type Section = "sleep" | "fitness" | "nutrition";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  { key: "fitness", label: "Fitness" },
  { key: "nutrition", label: "Nutrition" },
];

/** Local YYYY-MM-DD — matches how sleep entries are dated server-side. */
const todayKey = () => new Date().toLocaleDateString("en-CA");
const fmtDuration = (min: number) => `${Math.floor(min / 60)}h ${min % 60}m`;

/** The manual-input trio (sleep / fitness / nutrition) in one card, switched by
 * a segmented control. Each section shows today's total, a quick-add, and recents. */
export function HealthCard() {
  const [active, setActive] = useState<Section>("sleep");

  return (
    <Card title="Health">
      <div className="health-tabs">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`health-tab${s.key === active ? " active" : ""}`}
            onClick={() => setActive(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {active === "sleep" && <SleepSection />}
      {active === "fitness" && <FitnessSection />}
      {active === "nutrition" && <NutritionSection />}
    </Card>
  );
}

function TodayStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="health-stat">
      <span className="health-stat-value">{value}</span>
      <span className="health-stat-label">{label}</span>
    </div>
  );
}

function SleepSection() {
  const { data } = useSleep();
  const log = useLogSleep();
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState("");

  const entries = data?.entries ?? [];
  const todayMin = entries
    .filter((e) => e.date === todayKey())
    .reduce((s, e) => s + (e.durationMin ?? 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (!h) return;
    log.mutate(
      { durationMin: Math.round(h * 60), quality: quality ? Number(quality) : undefined },
      {
        onSuccess: () => {
          setHours("");
          setQuality("");
        },
      },
    );
  };

  return (
    <div className="health-section">
      <TodayStat value={todayMin ? fmtDuration(todayMin) : "—"} label="slept today" />
      <form className="log-form" onSubmit={submit}>
        <input type="number" min="0" step="0.5" placeholder="hours" value={hours} onChange={(e) => setHours(e.target.value)} />
        <input type="number" min="1" max="5" placeholder="1-5" value={quality} onChange={(e) => setQuality(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {entries.slice(0, 4).map((e) => (
          <li key={e.id}>
            {e.date ?? ""} · {fmtDuration(e.durationMin ?? 0)}
            {e.quality ? ` · quality ${e.quality}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FitnessSection() {
  const { data } = useFitness();
  const log = useLogFitness();
  const [activity, setActivity] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [intensity, setIntensity] = useState("");

  const entries = data?.entries ?? [];
  const today = entries.filter((e) => isSameLocalDay(e.loggedAt, Date.now()));
  const todayMin = today.reduce((s, e) => s + e.durationMin, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Number(durationMin);
    if (!activity.trim() || !mins) return;
    log.mutate(
      { activity: activity.trim(), durationMin: mins, intensity: intensity ? Number(intensity) : undefined },
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
    <div className="health-section">
      <TodayStat
        value={today.length ? `${today.length}× · ${todayMin}m` : "—"}
        label="trained today"
      />
      <form className="log-form" onSubmit={submit}>
        <input placeholder="activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
        <input type="number" min="1" placeholder="min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        <input type="number" min="1" max="5" placeholder="1-5" value={intensity} onChange={(e) => setIntensity(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {entries.slice(0, 4).map((e) => (
          <li key={e.id}>
            {e.activity} · {e.durationMin}m{e.intensity ? ` · intensity ${e.intensity}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NutritionSection() {
  const { data } = useNutrition();
  const log = useLogNutrition();
  const [meal, setMeal] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");

  const entries = data?.entries ?? [];
  const todayKcal = entries
    .filter((e) => isSameLocalDay(e.loggedAt, Date.now()))
    .reduce((s, e) => s + (e.calories ?? 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Number(calories);
    if (!cal) return;
    log.mutate(
      { meal: meal.trim() || undefined, calories: cal, protein: protein ? Number(protein) : undefined },
      {
        onSuccess: () => {
          setMeal("");
          setCalories("");
          setProtein("");
        },
      },
    );
  };

  return (
    <div className="health-section">
      <TodayStat value={todayKcal ? `${todayKcal} kcal` : "—"} label="eaten today" />
      <form className="log-form" onSubmit={submit}>
        <input placeholder="meal" value={meal} onChange={(e) => setMeal(e.target.value)} />
        <input type="number" min="1" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} />
        <input type="number" min="0" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {entries.slice(0, 4).map((e) => (
          <li key={e.id}>
            {e.meal ?? "meal"} · {e.calories} kcal{e.protein != null ? ` · ${e.protein}g protein` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
