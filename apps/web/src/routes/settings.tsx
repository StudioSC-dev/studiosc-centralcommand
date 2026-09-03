import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import type { ActivityLevel, ProfileInput, Sex } from "@central-command/types";
import { meQueryOptions, useIsDemo } from "../lib/auth";
import { profileQueryOptions, useProfile, useSaveProfile } from "../lib/profile";
import { settingsQueryOptions, useSettings, useSetClockZones } from "../lib/settings";
import { RIOT_REGIONS, useConnectRiot, useGaming } from "../lib/gaming";
import { useCalendar, useDisconnectGoogle } from "../lib/calendar";
import { useSetUnits } from "../lib/weather";
import { useTheme } from "../lib/theme";
import { LocationSetter } from "../components/LocationSetter";
import { useNotifications, useMarkAllRead, useRenameSource, useDeleteSource } from "../lib/notifications";
import { useGitHubActivity, useAddGitHubAccount, useRemoveGitHubAccount } from "../lib/github";

export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(profileQueryOptions);
    void context.queryClient.ensureQueryData(settingsQueryOptions);
  },
  component: SettingsPage,
});

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "connections", label: "Connections" },
  { key: "dashboard", label: "Dashboard" },
  { key: "preferences", label: "Preferences" },
  { key: "about", label: "About" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div className="page">
      <Link to="/" className="page-back">
        ← Back to dashboard
      </Link>
      <h1 className="page-title">Settings</h1>

      <div className="settings-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={`settings-tab${tab === t.key ? " is-active" : ""}`}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileSection />}
      {tab === "connections" && <ConnectionsTab />}
      {tab === "dashboard" && <DashboardTab />}
      {tab === "preferences" && <PreferencesSection />}
      {tab === "about" && <AboutSection />}
    </div>
  );
}

/* ─── Connections tab ──────────────────────────────────────────────────────── */

function ConnectionsTab() {
  return (
    <>
      <CalendarConnectionSection />
      <GameConnectionSection />
      <GitHubConnectionSection />
    </>
  );
}

/* ─── Dashboard tab ────────────────────────────────────────────────────────── */

function DashboardTab() {
  return (
    <>
      <ClockZonesSection />
      <NotificationSourcesSection />
    </>
  );
}

/* ─── Clock zones ──────────────────────────────────────────────────────────── */

function ClockZonesSection() {
  const { data } = useSettings();
  const setZones = useSetClockZones();
  const [newZone, setNewZone] = useState("");

  const zones = data?.settings?.clockZones ?? [];

  const addZone = (e: React.FormEvent) => {
    e.preventDefault();
    const tz = newZone.trim();
    if (!tz || zones.includes(tz)) return;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return;
    }
    setZones.mutate({ zones: [...zones, tz] });
    setNewZone("");
  };

  const removeZone = (tz: string) => {
    setZones.mutate({ zones: zones.filter((z) => z !== tz) });
  };

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">World Clock Timezones</h2>
      {zones.length > 0 ? (
        <ul className="tz-list">
          {zones.map((tz) => (
            <li key={tz} className="tz-item">
              <span>{tz.replace(/_/g, " ")}</span>
              <button
                type="button"
                className="tz-remove"
                onClick={() => removeZone(tz)}
                title={`Remove ${tz}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-hint">No timezones configured. Add one below.</p>
      )}
      <form className="settings-form tz-add-form" onSubmit={addZone}>
        <label className="field">
          <span className="field-label">Add timezone</span>
          <input
            type="text"
            list="tz-datalist"
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
            placeholder="e.g. America/New_York"
          />
          <datalist id="tz-datalist">
            {Intl.supportedValuesOf("timeZone").map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </label>
        <div className="settings-actions">
          <button
            type="submit"
            className="onboard-submit"
            disabled={!newZone.trim() || setZones.isPending}
          >
            Add
          </button>
        </div>
      </form>
    </section>
  );
}

/* ─── Notification sources ─────────────────────────────────────────────────── */

function NotificationSourcesSection() {
  const { data } = useNotifications();
  const markAll = useMarkAllRead();
  const rename = useRenameSource();
  const remove = useDeleteSource();
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const sources = data?.sources ?? [];

  const startEdit = (source: string, currentLabel: string) => {
    setEditing(source);
    setEditLabel(currentLabel);
  };

  const saveEdit = (source: string) => {
    const label = editLabel.trim();
    if (label) rename.mutate({ source, label });
    setEditing(null);
  };

  const handleRemove = (source: string) => {
    if (confirming === source) {
      remove.mutate(source);
      setConfirming(null);
    } else {
      setConfirming(source);
    }
  };

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">Notification Sources</h2>
      <p className="settings-hint">
        Sources appear automatically when a service starts pushing notifications.
        Rename them or remove ones you no longer need.
      </p>
      {sources.length > 0 ? (
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.source} className="source-item">
              <div className="source-info">
                {editing === s.source ? (
                  <form
                    className="source-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(s.source);
                    }}
                  >
                    <input
                      type="text"
                      className="source-edit-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      maxLength={60}
                      autoFocus
                      onBlur={() => saveEdit(s.source)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  </form>
                ) : (
                  <>
                    <span className="source-label">{s.label}</span>
                    <span className="source-key">{s.source}</span>
                    <button
                      type="button"
                      className="source-edit-btn"
                      onClick={() => startEdit(s.source, s.label)}
                      title="Rename"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <div className="source-actions">
                {s.unread > 0 && (
                  <span className="source-unread">{s.unread}</span>
                )}
                <button
                  type="button"
                  className="source-mark-read"
                  onClick={() => markAll.mutate(s.source)}
                  disabled={s.unread === 0 || markAll.isPending}
                  title={`Mark ${s.label} read`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="5 13 10 18 19 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`source-remove${confirming === s.source ? " is-confirming" : ""}`}
                  onClick={() => handleRemove(s.source)}
                  onBlur={() => setConfirming(null)}
                  disabled={remove.isPending}
                  title={confirming === s.source ? "Click again to confirm" : `Remove ${s.label}`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-hint">No notification sources connected yet.</p>
      )}
    </section>
  );
}

/* ─── GitHub connection ────────────────────────────────────────────────────── */

function GitHubConnectionSection() {
  const demo = useIsDemo();
  const { data } = useGitHubActivity();
  const addAccount = useAddGitHubAccount();
  const removeAccount = useRemoveGitHubAccount();
  const [label, setLabel] = useState("");
  const [pat, setPat] = useState("");

  const accounts: { id: string; label: string }[] =
    (data as { accounts?: { id: string; label: string }[] } | undefined)?.accounts ?? [];
  const connected = data?.connected === true;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = label.trim() || "Default";
    const t = pat.trim();
    if (!t) return;
    addAccount.mutate({ label: l, token: t });
    setLabel("");
    setPat("");
  };

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">GitHub</h2>
      {connected && accounts.length > 0 && (
        <ul className="gh-account-list">
          {accounts.map((a) => (
            <li key={a.id} className="gh-account-item">
              <span>{a.label}</span>
              <button
                type="button"
                className="tz-remove"
                onClick={() => removeAccount.mutate(a.id)}
                title={`Remove ${a.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {connected && accounts.length === 0 && (
        <p className="settings-hint">
          Connected with a single token. Add a labeled account below to manage multiple.
        </p>
      )}
      {demo ? (
        <p className="settings-hint">Sign in to connect a GitHub account.</p>
      ) : (
        <form className="settings-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Account label</span>
            <input
              type="text"
              value={label}
              placeholder="e.g. Personal, Work"
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Personal access token</span>
            <input
              type="password"
              value={pat}
              placeholder="ghp_..."
              onChange={(e) => setPat(e.target.value)}
            />
          </label>
          {addAccount.isError && (
            <p className="log-error">Couldn't connect: {addAccount.error.message}</p>
          )}
          <div className="settings-actions">
            <button
              type="submit"
              className="onboard-submit"
              disabled={!pat.trim() || addAccount.isPending}
            >
              {addAccount.isPending ? "Connecting…" : "Add account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ─── About ────────────────────────────────────────────────────────────────── */

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

/* ─── Profile ──────────────────────────────────────────────────────────────── */

function ProfileSection() {
  const { data, isPending } = useProfile();
  const save = useSaveProfile();

  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | "">("");

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

      {save.isError && <p className="log-error">Couldn't save: {save.error.message}</p>}
      <div className="settings-actions">
        <button type="submit" className="onboard-submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        {save.isSuccess && !save.isPending && <span className="settings-saved">Saved ✓</span>}
      </div>
    </form>
  );
}

/* ─── Game connection ──────────────────────────────────────────────────────── */

function GameConnectionSection() {
  const demo = useIsDemo();
  const { data: profileData } = useProfile();
  const { data: gaming } = useGaming();
  const save = useSaveProfile();
  const connect = useConnectRiot();

  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("sg2");

  useEffect(() => {
    const p = profileData?.profile;
    if (!p) return;
    if (p.riotId) setRiotId(p.riotId);
    if (p.riotRegion) setRegion(p.riotRegion);
  }, [profileData]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = riotId.trim();
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
          {connect.isError && <p className="log-error">Couldn't connect: {connect.error.message}</p>}
          {save.isError && <p className="log-error">Couldn't save: {save.error.message}</p>}
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

/* ─── Calendar connection ──────────────────────────────────────────────────── */

function CalendarConnectionSection() {
  const { data } = useCalendar();
  const disconnect = useDisconnectGoogle();
  const connected = data?.connected === true;

  return (
    <section className="settings-block">
      <h2 className="settings-section-title">Calendar connection</h2>
      {connected ? (
        <>
          <p className="settings-hint">Google Calendar is connected.</p>
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
            Connect Google Calendar to show your events and daily busyness.
          </p>
          <a className="connect-link" href="/api/auth/google">
            {data?.needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </a>
        </>
      )}
    </section>
  );
}

/* ─── Preferences ──────────────────────────────────────────────────────────── */

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
    </>
  );
}
