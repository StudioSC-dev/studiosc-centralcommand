import { createFileRoute } from "@tanstack/react-router";
import type { Pillar } from "@central-command/types";
import { WeatherCard } from "../components/WeatherCard";
import { CalendarCard } from "../components/CalendarCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// Pillars still awaiting their own cards.
const PENDING_PILLARS: Pillar[] = [
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
      <CalendarCard />
      <WeatherCard />
      <ul className="pillar-grid">
        {PENDING_PILLARS.map((pillar) => (
          <li key={pillar} className="pillar-card">
            {pillar}
          </li>
        ))}
      </ul>
    </section>
  );
}
