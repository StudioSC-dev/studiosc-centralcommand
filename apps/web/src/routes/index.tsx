import { createFileRoute } from "@tanstack/react-router";
import type { Pillar } from "@central-command/types";
import { WeatherCard } from "../components/WeatherCard";
import { CalendarCard } from "../components/CalendarCard";
import { NewsCard } from "../components/NewsCard";
import { FitnessCard } from "../components/FitnessCard";
import { NutritionCard } from "../components/NutritionCard";
import { SleepCard } from "../components/SleepCard";
import { PerformanceCard } from "../components/PerformanceCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// Pillars still awaiting their own cards.
const PENDING_PILLARS: Pillar[] = ["gaming"];

function Dashboard() {
  return (
    <section className="dashboard">
      <PerformanceCard />
      <CalendarCard />
      <WeatherCard />
      <SleepCard />
      <FitnessCard />
      <NutritionCard />
      <NewsCard />
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
