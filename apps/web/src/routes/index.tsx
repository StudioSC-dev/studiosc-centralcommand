import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQueryOptions } from "../lib/auth";
import { DemoBanner } from "../components/DemoBanner";
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
  // Gate: must have a session (else /login) and a completed profile (else /onboarding).
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
    if (!me.profileComplete) throw redirect({ to: "/onboarding" });
  },
  component: Dashboard,
});

function Dashboard() {
  return (
    <>
      <DemoBanner />
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
    </>
  );
}
