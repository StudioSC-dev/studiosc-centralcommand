import type { ReactNode } from "react";

export interface CardProps {
  title: string;
  children: ReactNode;
  /** Pillar key for the per-card accent tint (e.g. "weather", "tasks"). */
  pillar?: string;
}

/** Shared dashboard card shell: fixed-size glass tile with a scrollable body. */
export function Card({ title, children, pillar }: CardProps) {
  const className = ["card", pillar && `pillar-${pillar}`].filter(Boolean).join(" ");
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
