import type { ReactNode } from "react";

export interface CardProps {
  title: string;
  children: ReactNode;
  /** Pillar key for the per-card accent tint (e.g. "weather", "tasks"). */
  pillar?: string;
  /**
   * Extra classes on the card's outer element. This is the single hook by which
   * anything outside a card can affect its tile — card-specific styling today,
   * and the grid-span classes when sizing lands (docs/ui-suite.md P2). Every
   * card must route through this shell for that to work, which is why the two
   * hand-rolled shells were folded back in.
   */
  className?: string;
}

/** Shared dashboard card shell: fixed-size glass tile with a scrollable body. */
export function Card({ title, children, pillar, className: extra }: CardProps) {
  const className = ["card", pillar && `pillar-${pillar}`, extra].filter(Boolean).join(" ");
  return (
    <section className={className}>
      <h2 className="card-title">
        <span className="card-dot" aria-hidden="true" />
        {title}
      </h2>
      <div className="card-body">{children}</div>
    </section>
  );
}
