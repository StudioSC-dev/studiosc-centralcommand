import { createFileRoute } from "@tanstack/react-router";
import { WeatherCard } from "../components/WeatherCard";
import { SummaryCard } from "../components/SummaryCard";
import { PerformanceCard } from "../components/PerformanceCard";
import { NewsCard } from "../components/NewsCard";
import { CalendarCard } from "../components/CalendarCard";
import { TasksCard } from "../components/TasksCard";
import { HealthCard } from "../components/HealthCard";
import { GamingCard } from "../components/GamingCard";
import { InsightsCard } from "../components/InsightsCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <section className="dashboard">
      <WeatherCard />
      <SummaryCard />
      <PerformanceCard />
      <CalendarCard />
      <TasksCard />
      <HealthCard />
      <GamingCard />
      <InsightsCard />
      <NewsCard />
    </section>
  );
}
