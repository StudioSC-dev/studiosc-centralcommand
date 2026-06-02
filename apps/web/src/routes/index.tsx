import { createFileRoute } from "@tanstack/react-router";
import { WeatherCard } from "../components/WeatherCard";
import { CalendarCard } from "../components/CalendarCard";
import { NewsCard } from "../components/NewsCard";
import { FitnessCard } from "../components/FitnessCard";
import { NutritionCard } from "../components/NutritionCard";
import { SleepCard } from "../components/SleepCard";
import { PerformanceCard } from "../components/PerformanceCard";
import { GamingCard } from "../components/GamingCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <section className="dashboard">
      <PerformanceCard />
      <CalendarCard />
      <WeatherCard />
      <SleepCard />
      <FitnessCard />
      <NutritionCard />
      <GamingCard />
      <NewsCard />
    </section>
  );
}
