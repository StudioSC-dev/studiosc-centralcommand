import { useState, type ReactNode } from "react";
import type {
  FitnessLogEntry,
  FitnessLogUpdate,
  NutritionLogEntry,
  NutritionLogUpdate,
  SleepLogEntry,
  SleepLogUpdate,
} from "@central-command/types";
import { Card } from "./Card";
import { InlineText } from "./inline";
import {
  useDeleteFitness,
  useDeleteNutrition,
  useDeleteSleep,
  useFitness,
  useLogFitness,
  useLogNutrition,
  useLogSleep,
  useNutrition,
  useSleep,
  useUpdateFitness,
  useUpdateNutrition,
  useUpdateSleep,
} from "../lib/logs";
import { isSameLocalDay } from "../lib/time";
import { useIsDemo } from "../lib/auth";

type Section = "sleep" | "fitness" | "nutrition";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  { key: "fitness", label: "Fitness" },
  { key: "nutrition", label: "Nutrition" },
];

/** Local YYYY-MM-DD — matches how sleep entries are dated server-side. */
const todayKey = () => new Date().toLocaleDateString("en-CA");
const fmtDuration = (min: number) => `${Math.floor(min / 60)}h ${min % 60}m`;
/** durationMin → a tidy hours string for editing (e.g. 450 → "7.5"). */
const minToHours = (min: number) => String(+(min / 60).toFixed(2));
const shortDate = (d?: string) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** True if `ts` falls within the last `n` days (today inclusive). */
const withinLastDays = (ts: number, n: number, now: number) =>
  startOfDay(ts) >= startOfDay(now) - (n - 1) * 86_400_000;

/** The manual-input trio (sleep / fitness / nutrition) in one card, switched by
 * a segmented control. Each section shows today's total, a quick-add, and recent
 * entries whose fields are edited in place (click a value; no Save/Cancel). */
export function HealthCard() {
  const [active, setActive] = useState<Section>("sleep");

  return (
    <Card title="Health" pillar="health">
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

/** Row shell: inline-editable fields + a subtle hover delete (no edit icon). In
 * read-only demo it collapses to a plain text summary. */
function LogRow({
  demo,
  summary,
  onDelete,
  children,
}: {
  demo: boolean;
  summary: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  if (demo) {
    return (
      <li className="log-item">
        <span className="log-text">{summary}</span>
      </li>
    );
  }
  return (
    <li className="log-item">
      <div className="log-fields">{children}</div>
      <button type="button" className="log-del" onClick={onDelete} aria-label="Delete entry" title="Delete">
        ×
      </button>
    </li>
  );
}

/** Inline-editable numeric stat: "" → null, valid number → number, else ignored. */
function NumField({
  value,
  display,
  placeholder,
  label,
  onSave,
  required = false,
}: {
  value: number | null;
  display: ReactNode;
  placeholder?: string;
  label: string;
  onSave: (v: number | null) => void;
  required?: boolean;
}) {
  return (
    <InlineText
      className="log-field log-num"
      ariaLabel={label}
      inputMode="decimal"
      value={value != null ? String(value) : ""}
      display={display}
      placeholder={required ? undefined : placeholder}
      allowEmpty={!required}
      onCommit={(raw) => {
        if (raw === "") return onSave(null);
        const n = Number(raw);
        if (Number.isFinite(n)) onSave(n);
      }}
    />
  );
}

function SleepSection() {
  const demo = useIsDemo();
  const { data } = useSleep();
  const log = useLogSleep();
  const update = useUpdateSleep();
  const remove = useDeleteSleep();
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState("");
  const [hrv, setHrv] = useState("");
  const [restingHr, setRestingHr] = useState("");

  const entries = data?.entries ?? [];
  const now = Date.now();
  const todayMin = entries
    .filter((e) => e.date === todayKey())
    .reduce((s, e) => s + (e.durationMin ?? 0), 0);
  const recent = entries.filter((e) =>
    e.date ? withinLastDays(new Date(`${e.date}T00:00:00`).getTime(), 7, now) : false,
  );
  const olderCount = entries.length - recent.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (!h) return;
    log.mutate(
      {
        durationMin: Math.round(h * 60),
        quality: quality ? Number(quality) : undefined,
        hrv: hrv ? Number(hrv) : undefined,
        restingHr: restingHr ? Number(restingHr) : undefined,
      },
      {
        onSuccess: () => {
          setHours("");
          setQuality("");
          setHrv("");
          setRestingHr("");
        },
      },
    );
  };

  return (
    <div className="health-section">
      <TodayStat value={todayMin ? fmtDuration(todayMin) : "—"} label="slept today" />
      {!demo && (
        <form className="log-form" onSubmit={submit}>
          <input type="number" min="0" step="0.5" placeholder="hours" value={hours} onChange={(e) => setHours(e.target.value)} />
          <input type="number" min="1" max="5" placeholder="1-5" value={quality} onChange={(e) => setQuality(e.target.value)} />
          <input type="number" min="1" max="300" placeholder="HRV ms" value={hrv} onChange={(e) => setHrv(e.target.value)} />
          <input type="number" min="30" max="220" placeholder="RHR bpm" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
          <button type="submit" disabled={log.isPending}>Log</button>
        </form>
      )}
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {recent.map((entry) => (
          <SleepRow
            key={entry.id}
            entry={entry}
            demo={demo}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
      {olderCount > 0 && <p className="log-older">{olderCount} older hidden</p>}
    </div>
  );
}

function SleepRow({
  entry,
  demo,
  onSave,
  onDelete,
}: {
  entry: SleepLogEntry;
  demo: boolean;
  onSave: (patch: SleepLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const save = (patch: SleepLogUpdate) => onSave({ id: entry.id, ...patch });
  const summary = `${shortDate(entry.date)} · ${fmtDuration(entry.durationMin ?? 0)}${entry.quality ? ` · Q${entry.quality}` : ""}${entry.hrv != null ? ` · HRV ${entry.hrv}` : ""}${entry.restingHr != null ? ` · RHR ${entry.restingHr}` : ""}`;

  return (
    <LogRow demo={demo} summary={summary} onDelete={onDelete}>
      <span className="log-date">{shortDate(entry.date)}</span>
      <InlineText
        className="log-field log-num"
        ariaLabel="Hours slept"
        inputMode="decimal"
        value={minToHours(entry.durationMin ?? 0)}
        display={fmtDuration(entry.durationMin ?? 0)}
        onCommit={(raw) => {
          const h = Number(raw);
          if (Number.isFinite(h) && h > 0) save({ durationMin: Math.round(h * 60) });
        }}
      />
      <NumField label="Quality (1-5)" value={entry.quality ?? null} display={`Q${entry.quality}`} placeholder="＋ quality" onSave={(v) => save({ quality: v })} />
      <NumField label="HRV (ms)" value={entry.hrv ?? null} display={`HRV ${entry.hrv}`} placeholder="＋ HRV" onSave={(v) => save({ hrv: v })} />
      <NumField label="Resting HR (bpm)" value={entry.restingHr ?? null} display={`RHR ${entry.restingHr}`} placeholder="＋ RHR" onSave={(v) => save({ restingHr: v })} />
    </LogRow>
  );
}

function FitnessSection() {
  const demo = useIsDemo();
  const { data } = useFitness();
  const log = useLogFitness();
  const update = useUpdateFitness();
  const remove = useDeleteFitness();
  const [activity, setActivity] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [intensity, setIntensity] = useState("");

  const entries = data?.entries ?? [];
  const now = Date.now();
  const today = entries.filter((e) => isSameLocalDay(e.loggedAt, now));
  const todayMin = today.reduce((s, e) => s + e.durationMin, 0);
  const recent = entries.filter((e) => withinLastDays(e.loggedAt, 7, now));
  const olderCount = entries.length - recent.length;

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
      {!demo && (
        <form className="log-form" onSubmit={submit}>
          <input placeholder="activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
          <input type="number" min="1" placeholder="min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
          <input type="number" min="1" max="5" placeholder="1-5" value={intensity} onChange={(e) => setIntensity(e.target.value)} />
          <button type="submit" disabled={log.isPending}>Log</button>
        </form>
      )}
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {recent.map((entry) => (
          <FitnessRow
            key={entry.id}
            entry={entry}
            demo={demo}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
      {olderCount > 0 && <p className="log-older">{olderCount} older hidden</p>}
    </div>
  );
}

function FitnessRow({
  entry,
  demo,
  onSave,
  onDelete,
}: {
  entry: FitnessLogEntry;
  demo: boolean;
  onSave: (patch: FitnessLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const save = (patch: FitnessLogUpdate) => onSave({ id: entry.id, ...patch });
  const summary = `${entry.activity} · ${entry.durationMin}m${entry.intensity ? ` · i${entry.intensity}` : ""}`;

  return (
    <LogRow demo={demo} summary={summary} onDelete={onDelete}>
      <InlineText
        className="log-field log-textf"
        ariaLabel="Activity"
        value={entry.activity}
        onCommit={(raw) => save({ activity: raw })}
      />
      <NumField label="Duration (min)" value={entry.durationMin} display={`${entry.durationMin}m`} required onSave={(v) => v != null && save({ durationMin: v })} />
      <NumField label="Intensity (1-5)" value={entry.intensity ?? null} display={`i${entry.intensity}`} placeholder="＋ intensity" onSave={(v) => save({ intensity: v })} />
    </LogRow>
  );
}

function NutritionSection() {
  const demo = useIsDemo();
  const { data } = useNutrition();
  const log = useLogNutrition();
  const update = useUpdateNutrition();
  const remove = useDeleteNutrition();
  const [meal, setMeal] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");

  const entries = data?.entries ?? [];
  const now = Date.now();
  const todayKcal = entries
    .filter((e) => isSameLocalDay(e.loggedAt, now))
    .reduce((s, e) => s + (e.calories ?? 0), 0);
  // Nutrition is the busiest log (4–5 meals/day) — a tighter 3-day window.
  const recent = entries.filter((e) => withinLastDays(e.loggedAt, 3, now));
  const olderCount = entries.length - recent.length;

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
      {!demo && (
        <form className="log-form" onSubmit={submit}>
          <input placeholder="meal" value={meal} onChange={(e) => setMeal(e.target.value)} />
          <input type="number" min="1" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} />
          <input type="number" min="0" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <button type="submit" disabled={log.isPending}>Log</button>
        </form>
      )}
      {log.isError && <p className="log-error">{log.error.message}</p>}
      <ul className="log-list">
        {recent.map((entry) => (
          <NutritionRow
            key={entry.id}
            entry={entry}
            demo={demo}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
      {olderCount > 0 && <p className="log-older">{olderCount} older hidden</p>}
    </div>
  );
}

function NutritionRow({
  entry,
  demo,
  onSave,
  onDelete,
}: {
  entry: NutritionLogEntry;
  demo: boolean;
  onSave: (patch: NutritionLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const save = (patch: NutritionLogUpdate) => onSave({ id: entry.id, ...patch });
  const summary = `${entry.meal ?? "meal"} · ${entry.calories} kcal${entry.protein != null ? ` · ${entry.protein}g protein` : ""}`;

  return (
    <LogRow demo={demo} summary={summary} onDelete={onDelete}>
      <InlineText
        className="log-field log-textf"
        ariaLabel="Meal"
        value={entry.meal ?? ""}
        display={entry.meal ?? "meal"}
        placeholder="＋ meal"
        allowEmpty
        onCommit={(raw) => save({ meal: raw === "" ? null : raw })}
      />
      <NumField label="Calories (kcal)" value={entry.calories} display={`${entry.calories} kcal`} required onSave={(v) => v != null && save({ calories: v })} />
      <NumField label="Protein (g)" value={entry.protein ?? null} display={`${entry.protein}g`} placeholder="＋ protein" onSave={(v) => save({ protein: v })} />
    </LogRow>
  );
}
