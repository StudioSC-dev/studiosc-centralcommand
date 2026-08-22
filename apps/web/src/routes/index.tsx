import type { CSSProperties } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CARD_KEYS } from "@central-command/types";
import { meQueryOptions } from "../lib/auth";
import { dashboardLayoutQueryOptions, useDashboardLayout } from "../lib/dashboard";
import { cardsFor } from "../components/cardRegistry";
import { DemoBanner } from "../components/DemoBanner";

export const Route = createFileRoute("/")({
  // Gate: must have a session (else /login) and a completed profile (else /onboarding).
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
    if (!me.profileComplete) throw redirect({ to: "/onboarding" });
  },
  // Awaited, unlike the settings route's fire-and-forget prefetch: the layout
  // decides how many cards and how many columns the grid has, so rendering
  // before it arrives means painting the default nine and then reflowing the
  // entire dashboard. One small same-origin request is the cheaper trade.
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardLayoutQueryOptions),
  component: Dashboard,
});

/**
 * Grid shape for a given number of visible cards (docs/ui-suite.md D2).
 *
 * Columns grow from the card count, capped at 4 — past twelve cells the tiles
 * are too narrow to read on a wall display, and that is the honest ceiling.
 * Rows are then derived from the columns rather than pinned at 3, so a small
 * dashboard still fills the viewport instead of leaving an empty band at the
 * bottom: four cards give a 2×2, not a 2×3 with a hole in it.
 */
export function gridShape(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  const cols = Math.min(4, Math.ceil(count / 3));
  const rows = Math.min(3, Math.ceil(count / cols));
  return { cols, rows };
}

function Dashboard() {
  const { data } = useDashboardLayout();

  // The loader above guarantees this is warm; the fallback covers only the
  // cache being evicted mid-session.
  const visible = data?.layout.visible ?? CARD_KEYS;
  const cards = cardsFor(visible);
  const { cols, rows } = gridShape(cards.length);

  return (
    <>
      <DemoBanner />
      <section
        className="dashboard"
        style={{ "--dash-cols": cols, "--dash-rows": rows } as CSSProperties}
      >
        {cards.map(({ key, component: CardComponent }) => (
          <CardComponent key={key} />
        ))}
      </section>
    </>
  );
}
