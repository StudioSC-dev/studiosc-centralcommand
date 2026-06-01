import { createFileRoute } from "@tanstack/react-router";
import type { Pillar } from "@central-command/types";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const PILLARS: Pillar[] = [
  "calendar",
  "weather",
  "fitness",
  "nutrition",
  "sleep",
  "gaming",
  "news",
  "performance",
];

function Dashboard() {
  return (
    <section className="dashboard">
      <p>Phase 1 scaffolding. The pillars below are not wired up yet.</p>
      <ul className="pillar-grid">
        {PILLARS.map((pillar) => (
          <li key={pillar} className="pillar-card">
            {pillar}
          </li>
        ))}
      </ul>
    </section>
  );
}
