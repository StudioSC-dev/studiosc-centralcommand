import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQueryOptions } from "../lib/auth";
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
  // Gate: must have a session (cookie, Access JWT, or dev) — else go to /login.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
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
