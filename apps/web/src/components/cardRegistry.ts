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

/**
 * Registry entries for the given keys, **in the order given**.
 *
 * The order of `keys` is the user's card order, so it has to survive this
 * lookup. An earlier version filtered `CARD_REGISTRY` instead, which always
 * returned registry order and silently discarded the caller's — correct while
 * order was fixed in Phase 1, wrong the moment reordering shipped, and invisible
 * because the return type never changed.
 *
 * Unknown keys are dropped rather than throwing: a key can outlive the card it
 * names (a removed pillar still sitting in someone's stored order), and that
 * should cost that one card, not the whole dashboard.
 */
export function cardsFor(keys: readonly CardKey[]): CardDefinition[] {
  const byKey = new Map(CARD_REGISTRY.map((card) => [card.key, card]));
  return keys
    .map((key) => byKey.get(key))
    .filter((card): card is CardDefinition => card !== undefined);
}
