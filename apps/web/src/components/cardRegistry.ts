import type { ComponentType } from "react";
import type { CardKey } from "@central-command/types";
import { CARD_CATALOG, type CardMeta } from "./cardCatalog";
import { WeatherCard } from "./WeatherCard";
import { SummaryCard } from "./SummaryCard";
import { PerformanceCard } from "./PerformanceCard";
import { CalendarCard } from "./CalendarCard";
import { TasksCard } from "./TasksCard";
import { HealthCard } from "./HealthCard";
import { GamingCard } from "./GamingCard";
import { InsightsCard } from "./InsightsCard";
import { NewsCard } from "./NewsCard";

/**
 * Key → component. Typed as a total record over `CardKey`, so adding a key to
 * the union without adding a component here is a build error — which is the
 * whole point of the union (docs/ui-suite.md D3).
 */
const CARD_COMPONENTS: Record<CardKey, ComponentType> = {
  weather: WeatherCard,
  summary: SummaryCard,
  perf: PerformanceCard,
  calendar: CalendarCard,
  tasks: TasksCard,
  health: HealthCard,
  gaming: GamingCard,
  insights: InsightsCard,
  news: NewsCard,
};

export interface CardDefinition extends CardMeta {
  component: ComponentType;
}

/**
 * The card registry — the single source of truth for what the dashboard can
 * render, replacing the nine hardcoded JSX tags that used to live in
 * `routes/index.tsx`. Adding a card is one `CardKey`, one catalogue entry and
 * one component binding; neither the grid nor the settings page needs editing.
 */
export const CARD_REGISTRY: readonly CardDefinition[] = CARD_CATALOG.map((meta) => ({
  ...meta,
  component: CARD_COMPONENTS[meta.key],
}));

/** Registry entries for a set of keys, in registry order. */
export function cardsFor(keys: readonly CardKey[]): CardDefinition[] {
  const wanted = new Set(keys);
  return CARD_REGISTRY.filter((card) => wanted.has(card.key));
}
