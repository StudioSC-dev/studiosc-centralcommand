import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import type { ActivityLevel, ProfileInput, Sex } from "@central-command/types";
import { meQueryOptions, useIsDemo } from "../lib/auth";
import { profileQueryOptions, useProfile, useSaveProfile } from "../lib/profile";
import { settingsQueryOptions, useSettings } from "../lib/settings";
import { RIOT_REGIONS, useConnectRiot, useGaming } from "../lib/gaming";
import { useCalendar, useDisconnectGoogle } from "../lib/calendar";
import { useSetUnits } from "../lib/weather";
import { useTheme } from "../lib/theme";
import { LocationSetter } from "../components/LocationSetter";

export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
  // Warm the page's data into the query cache. With defaultPreload: "intent"
  // this runs on link hover, so the page's data is usually ready before the
  // click. Fire-and-forget (not awaited) so navigation is never blocked.
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(profileQueryOptions);
    void context.queryClient.ensureQueryData(settingsQueryOptions);
  },
  component: SettingsPage,
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

function SettingsPage() {
  return (
    <div className="page">
      <Link to="/" className="page-back">
        ← Back to dashboard
      </Link>
      <h1 className="page-title">Settings</h1>

      <ProfileSection />
      <GameConnectionSection />
      <CalendarConnectionSection />
      <PreferencesSection />
      <AboutSection />
    </div>
  );
}

/** About — what the app is, plus links back to the portfolio + a contact method.
 * URL/email come from env (VITE_PORTFOLIO_URL / VITE_CONTACT_EMAIL) so no contact
 * address is hard-coded in source. */
function AboutSection() {
  const portfolioUrl = import.meta.env.VITE_PORTFOLIO_URL;
  const contactEmail = import.meta.env.VITE_CONTACT_EMAIL;

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">About</h2>
      <p className="settings-hint">
        Central Command is a personal performance dashboard — a Cloudflare-native
        aggregator for calendar, weather, fitness, gaming, and more.
      </p>
      {(portfolioUrl || contactEmail) && (
        <div className="about-links">
          {portfolioUrl && (
            <a className="connect-link" href={portfolioUrl} target="_blank" rel="noreferrer">
              Portfolio ↗
            </a>
          )}
          {contactEmail && (
            <a className="connect-link" href={`mailto:${contactEmail}`}>
              Contact
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/** Account profile — display name, demographics, and optional body metrics. */
function ProfileSection() {
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

  if (isPending) {
    return (
      <section className="settings-block">
        <h2 className="settings-section-title">Profile</h2>
        <p className="settings-hint">Loading…</p>
      </section>
    );
  }

  return (
    <form className="settings-form settings-block" onSubmit={submit}>
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
  );
}

/** Game connection — save a Riot ID to the profile and connect the gaming pillar
 * from it in one step (the dashboard card keeps its own quick-connect form too). */
function GameConnectionSection() {
  const demo = useIsDemo();
  const { data: profileData } = useProfile();
  const { data: gaming } = useGaming();
  const save = useSaveProfile();
  const connect = useConnectRiot();

  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("sg2");

  // Prefill from the saved profile tag once it loads.
  useEffect(() => {
    const p = profileData?.profile;
    if (!p) return;
    if (p.riotId) setRiotId(p.riotId);
    if (p.riotRegion) setRegion(p.riotRegion);
  }, [profileData]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = riotId.trim();
    // Persist the tag to the profile, then connect the gaming pillar from it.
    await save.mutateAsync({ riotId: id || null, riotRegion: id ? region : null });
    if (id.includes("#")) connect.mutate({ riotId: id, region });
  };

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">Game connection</h2>
      {gaming && gaming.connected && (
        <p className="settings-hint">
          Connected as <strong>{gaming.riotId}</strong> ({gaming.region}).
        </p>
      )}
      {demo ? (
        <p className="settings-hint">Sign in to connect a Riot account.</p>
      ) : (
        <form className="settings-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Riot ID (League of Legends)</span>
            <input
              type="text"
              value={riotId}
              placeholder="Name#TAG"
              maxLength={50}
              onChange={(e) => setRiotId(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Region</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {RIOT_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {connect.isError && <p className="log-error">Couldn’t connect: {connect.error.message}</p>}
          {save.isError && <p className="log-error">Couldn’t save: {save.error.message}</p>}
          <div className="settings-actions">
            <button
              type="submit"
              className="onboard-submit"
              disabled={save.isPending || connect.isPending}
            >
              {save.isPending || connect.isPending ? "Connecting…" : "Save & connect"}
            </button>
            {connect.isSuccess && !connect.isPending && (
              <span className="settings-saved">Connected ✓</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** Calendar connection — connect Google Calendar (read-only) or disconnect it
 * (revokes the grant + drops stored tokens server-side). */
function CalendarConnectionSection() {
  const { data } = useCalendar();
  const disconnect = useDisconnectGoogle();
  const connected = data?.connected === true;

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">Calendar connection</h2>
      {connected ? (
        <>
          <p className="settings-hint">Google Calendar is connected (read-only access).</p>
          <div className="settings-actions">
            <button
              type="button"
              className="onboard-submit settings-disconnect"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect Google Calendar"}
            </button>
            {disconnect.isError && (
              <span className="settings-hint">Couldn't disconnect: {disconnect.error.message}</span>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="settings-hint">
            Connect Google Calendar (read-only) to show your events and daily busyness.
          </p>
          <a className="connect-link" href="/api/auth/google">
            {data?.needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </a>
        </>
      )}
    </section>
  );
}

/** App preferences — units, theme, home location, and the disabled layout teaser. */
function PreferencesSection() {
  const { data } = useSettings();
  const setUnits = useSetUnits();
  const { theme, set: setTheme } = useTheme();

  const units = data?.settings?.units === "imperial" ? "imperial" : "metric";

  return (
    <>
      <section className="settings-block">
        <h2 className="settings-section-title">Units</h2>
        <div className="settings-row">
          <span>Temperature</span>
          <div className="seg">
            {(["metric", "imperial"] as const).map((u) => (
              <button
                key={u}
                type="button"
                className={`seg-btn${units === u ? " active" : ""}`}
                disabled={setUnits.isPending}
                onClick={() => units !== u && setUnits.mutate(u)}
              >
                {u === "metric" ? "°C" : "°F"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h2 className="settings-section-title">Appearance</h2>
        <div className="settings-row">
          <span>Theme</span>
          <div className="seg">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`seg-btn${theme === t ? " active" : ""}`}
                onClick={() => theme !== t && setTheme(t)}
              >
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h2 className="settings-section-title">Home location</h2>
        <LocationSetter />
      </section>

      <section className="settings-block settings-disabled">
        <h2 className="settings-section-title">Dashboard layout</h2>
        <p className="settings-hint">
          Resizing cards and choosing which to enable/disable is under development.
        </p>
      </section>
    </>
  );
}
