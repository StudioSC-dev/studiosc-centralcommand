import type { CSSProperties, ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CARD_KEYS } from "@central-command/types";
import { meQueryOptions } from "../lib/auth";
import {
  dashboardLayoutQueryOptions,
  useDashboardLayout,
  useLayoutError,
  useMoveCard,
  useToggleCard,
} from "../lib/dashboard";
import { useCardDrag } from "../lib/useCardDrag";
import { CardKeyContext, useEditMode } from "../lib/editMode";
import { cardsFor } from "../components/cardRegistry";
import { CARD_CATALOG } from "../components/cardCatalog";
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
 * **Rows first, then columns.** Rows grow only once each row is full, so the
 * grid fills across before it fills down. That matters because the viewport is
 * a widescreen: deriving columns first made three cards a 1×3, giving every
 * card the full window width at a third of its height — roughly 6:1, against
 * the ~2:1 tile the cards are actually designed for, which stretches their
 * contents badly. Filling columns first makes three cards a 3×1 instead, and
 * every count lands near the reference tile's proportions.
 *
 * Columns are capped at 4: past twelve cells the tiles are too narrow to read
 * on a wall display, and that is the honest ceiling.
 */
export function gridShape(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  const rows = Math.min(3, Math.ceil(count / 3));
  const cols = Math.min(4, Math.ceil(count / rows));
  return { cols, rows };
}

function Dashboard() {
  const { data } = useDashboardLayout();
  const { editing, stop } = useEditMode();
  const move = useMoveCard();
  const { gridRef, drag, handlers } = useCardDrag(move);

  // The loader above guarantees this is warm; the fallback covers only the
  // cache being evicted mid-session.
  const visible = data?.layout.visible ?? CARD_KEYS;
  const hidden = data?.layout.hidden ?? [];
  const cards = cardsFor(visible);
  const { cols, rows } = gridShape(cards.length);

  return (
    <>
      <DemoBanner />
      <section
        ref={gridRef}
        className={`dashboard${editing ? " is-editing" : ""}${drag ? " is-dragging" : ""}`}
        style={{ "--dash-cols": cols, "--dash-rows": rows } as CSSProperties}
        {...(editing ? { onPointerMove: handlers.onPointerMove } : {})}
        {...(editing ? { onPointerUp: handlers.onPointerUp } : {})}
        {...(editing ? { onPointerCancel: handlers.onPointerCancel } : {})}
      >
        {cards.map(({ key, component: CardComponent }, index) => (
          // Supplies each card its own identity, so the shared Card shell can
          // offer edit affordances without any card knowing it is editable.
          <CardKeyContext.Provider key={key} value={key}>
            <CardSlot
              index={index}
              editing={editing}
              count={cards.length}
              dragging={drag?.from === index}
              dropTarget={drag != null && drag.over === index && drag.from !== index}
              onPointerDown={handlers.onPointerDown}
              onMove={move}
            >
              <CardComponent />
            </CardSlot>
          </CardKeyContext.Provider>
        ))}
      </section>

      {editing && <EditBar hidden={hidden} onDone={stop} />}
    </>
  );
}

/**
 * Wraps one card in the grid with the reorder affordances.
 *
 * `display: contents` on purpose: the card itself must remain the grid item, so
 * this adds no box of its own and cannot disturb the layout it is editing —
 * the same reason the remove badge lives in the Card shell rather than a
 * wrapper. Drag state is expressed as classes on the card via CSS, not inline
 * styles, so the grid keeps owning placement.
 */
function CardSlot({
  index,
  count,
  editing,
  dragging,
  dropTarget,
  onPointerDown,
  onMove,
  children,
}: {
  index: number;
  count: number;
  editing: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onPointerDown: (index: number, e: React.PointerEvent) => void;
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  if (!editing) return <>{children}</>;

  const className = [
    "card-slot",
    dragging && "is-dragging",
    dropTarget && "is-drop-target",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onPointerDown={(e) => onPointerDown(index, e)}
      // Keyboard equivalent of the drag. This is not a nicety: removing the
      // settings list took away the only keyboard-operable way to arrange the
      // dashboard, and a pointer-only replacement would be a regression.
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" && index > 0) {
          e.preventDefault();
          onMove(index, index - 1);
        } else if (e.key === "ArrowRight" && index < count - 1) {
          e.preventDefault();
          onMove(index, index + 1);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Reorder card ${index + 1} of ${count}. Use arrow keys to move.`}
    >
      {children}
    </div>
  );
}

/**
 * Edit-mode bar: the cards you've hidden, and the way out.
 *
 * Hiding a card removes the very thing you'd click to get it back, so an
 * inventory of what's hidden is not a nicety — without it, hiding is one-way.
 * It floats over the grid rather than sitting in the layout, because the grid
 * is sized to fill the viewport exactly and giving it a strip would reflow
 * every card the moment you entered edit mode.
 */
function EditBar({ hidden, onDone }: { hidden: readonly string[]; onDone: () => void }) {
  const { toggle } = useToggleCard();
  const error = useLayoutError();
  const hiddenCards = CARD_CATALOG.filter((c) => hidden.includes(c.key));

  return (
    <div className="edit-bar" role="region" aria-label="Edit dashboard layout">
      <div className="edit-bar-inner">
        {hiddenCards.length === 0 ? (
          <p className="edit-bar-hint">
            Tap <span aria-hidden="true">–</span> on a card to hide it.
          </p>
        ) : (
          <>
            <span className="edit-bar-label">Hidden</span>
            <ul className="edit-bar-list">
              {hiddenCards.map((card) => (
                <li key={card.key}>
                  <button
                    type="button"
                    className="edit-chip"
                    onClick={() => toggle(card.key)}
                    title={`Show ${card.label}`}
                  >
                    <span className={`card-dot pillar-${card.key}`} aria-hidden="true" />
                    {card.label}
                    <span className="edit-chip-add" aria-hidden="true">
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <span className="edit-bar-error">Couldn’t save: {error.message}</span>}

        <button type="button" className="edit-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
