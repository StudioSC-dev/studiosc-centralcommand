import type { ReactNode } from "react";

/** Shared dashboard card shell: titled section. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}
