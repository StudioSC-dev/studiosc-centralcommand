import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ActivityLevel, ProfileInput, Sex } from "@central-command/types";
import { meQueryOptions } from "../lib/auth";
import { useProfile, useSaveProfile } from "../lib/profile";

export const Route = createFileRoute("/profile")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
  component: ProfilePage,
});

const SEXES: { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];
const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
];

function ProfilePage() {
  const { data, isPending } = useProfile();
  const save = useSaveProfile();

  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | "">("");

  // Prefill once the profile loads.
  useEffect(() => {
    const p = data?.profile;
    if (!p) return;
    setDisplayName(p.displayName ?? "");
    setBirthdate(p.birthdate ?? "");
    setSex(p.sex ?? "");
    setHeightCm(p.heightCm != null ? String(p.heightCm) : "");
    setWeightKg(p.weightKg != null ? String(p.weightKg) : "");
    setActivity(p.activityLevel ?? "");
  }, [data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: ProfileInput = {
      displayName: displayName.trim(),
      birthdate: birthdate || null,
      sex: (sex || null) as Sex | null,
      heightCm: heightCm ? Number(heightCm) : null,
      weightKg: weightKg ? Number(weightKg) : null,
      activityLevel: (activity || null) as ActivityLevel | null,
    };
    save.mutate(input);
  };

  if (isPending) return <div className="page"><p>Loading…</p></div>;

  return (
    <div className="page">
      <h1 className="page-title">Profile</h1>
      <form className="settings-form" onSubmit={submit}>
        <h2 className="settings-section-title">About you</h2>
        <label className="field">
          <span className="field-label">Display name</span>
          <input type="text" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Birthdate</span>
          <input type="date" value={birthdate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthdate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Sex</span>
          <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="">Not set</option>
            {SEXES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>

        <h2 className="settings-section-title">Body metrics (optional)</h2>
        <label className="field">
          <span className="field-label">Height (cm)</span>
          <input type="number" min="50" max="260" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Weight (kg)</span>
          <input type="number" min="20" max="400" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Activity level</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            <option value="">Not set</option>
            {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>

        {save.isError && <p className="log-error">Couldn’t save: {save.error.message}</p>}
        <div className="settings-actions">
          <button type="submit" className="onboard-submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          {save.isSuccess && !save.isPending && <span className="settings-saved">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}
