import { useState } from "react";
import type {
  FitnessLogEntry,
  FitnessLogUpdate,
  NutritionLogEntry,
  NutritionLogUpdate,
  SleepLogEntry,
  SleepLogUpdate,
} from "@central-command/types";
import { Card } from "./Card";
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

/** The manual-input trio (sleep / fitness / nutrition) in one card, switched by
 * a segmented control. Each section shows today's total, a quick-add, recents
 * that can be edited or deleted in place. */
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

/** Shared shell for an editable log row — display mode with edit/delete actions. */
function LogRow({
  text,
  editForm,
  onEdit,
  onDelete,
}: {
  text: string;
  editForm: React.ReactNode | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const demo = useIsDemo();
  if (editForm) return <li className="log-item log-item-editing">{editForm}</li>;
  return (
    <li className="log-item">
      <span className="log-text">{text}</span>
      {!demo && (
        <>
          <button type="button" className="log-edit" onClick={onEdit} aria-label="Edit entry" title="Edit">
            ✎
          </button>
          <button type="button" className="log-del" onClick={onDelete} aria-label="Delete entry">
            ×
          </button>
        </>
      )}
    </li>
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
  const todayMin = entries
    .filter((e) => e.date === todayKey())
    .reduce((s, e) => s + (e.durationMin ?? 0), 0);

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
        {entries.slice(0, 4).map((entry) => (
          <SleepRow
            key={entry.id}
            entry={entry}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function SleepRow({
  entry,
  onSave,
  onDelete,
}: {
  entry: SleepLogEntry;
  onSave: (patch: SleepLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState("");
  const [hrv, setHrv] = useState("");
  const [restingHr, setRestingHr] = useState("");

  const start = () => {
    setHours(minToHours(entry.durationMin ?? 0));
    setQuality(entry.quality != null ? String(entry.quality) : "");
    setHrv(entry.hrv != null ? String(entry.hrv) : "");
    setRestingHr(entry.restingHr != null ? String(entry.restingHr) : "");
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (!h) return;
    onSave({
      id: entry.id,
      durationMin: Math.round(h * 60),
      quality: quality ? Number(quality) : null,
      hrv: hrv ? Number(hrv) : null,
      restingHr: restingHr ? Number(restingHr) : null,
    });
    setEditing(false);
  };

  return (
    <LogRow
      text={`${entry.date ?? ""} · ${fmtDuration(entry.durationMin ?? 0)}${entry.quality ? ` · quality ${entry.quality}` : ""}${entry.hrv != null ? ` · HRV ${entry.hrv}ms` : ""}${entry.restingHr != null ? ` · RHR ${entry.restingHr}` : ""}`}
      onEdit={start}
      onDelete={onDelete}
      editForm={
        editing ? (
          <form className="log-edit-form" onSubmit={save}>
            <input type="number" min="0" step="0.5" placeholder="hours" value={hours} onChange={(e) => setHours(e.target.value)} autoFocus />
            <input type="number" min="1" max="5" placeholder="1-5" value={quality} onChange={(e) => setQuality(e.target.value)} />
            <input type="number" min="1" max="300" placeholder="HRV ms" value={hrv} onChange={(e) => setHrv(e.target.value)} />
            <input type="number" min="30" max="220" placeholder="RHR bpm" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
            <button type="submit">Save</button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : null
      }
    />
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
        {entries.slice(0, 4).map((entry) => (
          <FitnessRow
            key={entry.id}
            entry={entry}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function FitnessRow({
  entry,
  onSave,
  onDelete,
}: {
  entry: FitnessLogEntry;
  onSave: (patch: FitnessLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [intensity, setIntensity] = useState("");

  const start = () => {
    setActivity(entry.activity);
    setDurationMin(String(entry.durationMin));
    setIntensity(entry.intensity != null ? String(entry.intensity) : "");
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Number(durationMin);
    if (!activity.trim() || !mins) return;
    onSave({ id: entry.id, activity: activity.trim(), durationMin: mins, intensity: intensity ? Number(intensity) : null });
    setEditing(false);
  };

  return (
    <LogRow
      text={`${entry.activity} · ${entry.durationMin}m${entry.intensity ? ` · intensity ${entry.intensity}` : ""}`}
      onEdit={start}
      onDelete={onDelete}
      editForm={
        editing ? (
          <form className="log-edit-form" onSubmit={save}>
            <input placeholder="activity" value={activity} onChange={(e) => setActivity(e.target.value)} autoFocus />
            <input type="number" min="1" placeholder="min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
            <input type="number" min="1" max="5" placeholder="1-5" value={intensity} onChange={(e) => setIntensity(e.target.value)} />
            <button type="submit">Save</button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : null
      }
    />
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
        {entries.slice(0, 4).map((entry) => (
          <NutritionRow
            key={entry.id}
            entry={entry}
            onSave={(patch) => update.mutate(patch)}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function NutritionRow({
  entry,
  onSave,
  onDelete,
}: {
  entry: NutritionLogEntry;
  onSave: (patch: NutritionLogUpdate & { id: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [meal, setMeal] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");

  const start = () => {
    setMeal(entry.meal ?? "");
    setCalories(String(entry.calories));
    setProtein(entry.protein != null ? String(entry.protein) : "");
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Number(calories);
    if (!cal) return;
    onSave({ id: entry.id, meal: meal.trim() || null, calories: cal, protein: protein ? Number(protein) : null });
    setEditing(false);
  };

  return (
    <LogRow
      text={`${entry.meal ?? "meal"} · ${entry.calories} kcal${entry.protein != null ? ` · ${entry.protein}g protein` : ""}`}
      onEdit={start}
      onDelete={onDelete}
      editForm={
        editing ? (
          <form className="log-edit-form" onSubmit={save}>
            <input placeholder="meal" value={meal} onChange={(e) => setMeal(e.target.value)} autoFocus />
            <input type="number" min="1" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} />
            <input type="number" min="0" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
            <button type="submit">Save</button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : null
      }
    />
  );
}
