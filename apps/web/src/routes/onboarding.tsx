import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { Sex } from "@central-command/types";
import { meQueryOptions } from "../lib/auth";
import { useSaveProfile } from "../lib/profile";
import { LocationSetter } from "../components/LocationSetter";

/** First-run setup. Authed users only; skip if the profile is already complete. */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
    if (me.profileComplete) throw redirect({ to: "/" });
  },
  component: Onboarding,
});

const SEXES: { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

function Onboarding() {
  const navigate = useNavigate();
  const save = useSaveProfile();
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState<Sex | "">("");

  const ready = displayName.trim() && birthdate && sex;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    save.mutate(
      { displayName: displayName.trim(), birthdate, sex: sex as Sex },
      { onSuccess: () => navigate({ to: "/" }) },
    );
  };

  return (
    <div className="onboard-screen">
      <div className="onboard-card">
        <h1 className="onboard-title">Welcome to Central Command</h1>
        <p className="onboard-sub">A couple of details to personalize your dashboard.</p>

        <form className="onboard-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={80}
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Birthdate</span>
            <input
              type="date"
              value={birthdate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Sex</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="" disabled>
                Select…
              </option>
              {SEXES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {save.isError && <p className="log-error">Couldn’t save: {save.error.message}</p>}

          <button type="submit" className="onboard-submit" disabled={!ready || save.isPending}>
            {save.isPending ? "Saving…" : "Finish setup"}
          </button>
        </form>

        <div className="onboard-location">
          <p className="field-label">Home location (optional — powers weather)</p>
          <LocationSetter />
        </div>
      </div>
    </div>
  );
}
