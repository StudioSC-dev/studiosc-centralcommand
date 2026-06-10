import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQueryOptions } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { useSetUnits } from "../lib/weather";
import { useTheme } from "../lib/theme";
import { LocationSetter } from "../components/LocationSetter";

export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useSettings();
  const setUnits = useSetUnits();
  const { theme, toggle } = useTheme();

  const units = data?.settings?.units === "imperial" ? "imperial" : "metric";

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

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
          <button type="button" className="seg-btn" onClick={toggle}>
            {theme === "dark" ? "Dark" : "Light"}
          </button>
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
    </div>
  );
}
