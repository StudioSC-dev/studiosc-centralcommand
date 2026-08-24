import type { CardKey } from "@central-command/types";

/**
 * Display metadata for a dashboard card.
 *
 * `label` is for chrome *outside* the card (the settings list); it is not the
 * card's own heading, which each component still renders itself. They differ on
 * purpose in one place: the League card's heading is dynamic (it shows the
 * connected Riot ID), so a static label is what settings needs.
 */
export interface CardMeta {
  key: CardKey;
  label: string;
  description: string;
}

/**
 * The card catalogue — names and descriptions only, deliberately importing no
 * components. The settings page renders a list of these, and pulling the card
 * *implementations* in with them would put all nine on the settings bundle for
 * the sake of nine strings. `cardRegistry.ts` is the half that binds these keys
 * to components, and only the dashboard route imports it.
 *
 * Order is the dashboard's render order (fixed in Phase 1; user-controlled in
 * Phase 4 — see docs/ui-suite.md).
 */
export const CARD_CATALOG: readonly CardMeta[] = [
  {
    key: "weather",
    label: "Weather",
    description: "Current conditions and the daily outlook for your home location.",
  },
  {
    key: "summary",
    label: "Today",
    description: "A cross-pillar glance at the day: schedule, logs, and score.",
  },
  {
    key: "perf",
    label: "Performance",
    description: "Your daily score from sleep, nutrition, and HRV.",
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "Upcoming Google Calendar events and the day's busyness.",
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Current priorities, editable inline.",
  },
  {
    key: "health",
    label: "Health",
    description: "Sleep, nutrition, and fitness logging in one place.",
  },
  {
    key: "gaming",
    label: "League of Legends",
    description: "Rank, recent matches, and live game status from Riot.",
  },
  {
    key: "insights",
    label: "Insights",
    description: "Rule-based observations and correlations across your data.",
  },
  {
    key: "news",
    label: "News",
    description: "Basketball, League, and tech headlines.",
  },
] as const;
