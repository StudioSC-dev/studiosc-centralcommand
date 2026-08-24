import { useRef, type ReactNode } from "react";
import { cardSpan } from "@central-command/types";
import { useFitSections } from "../lib/useFitSections";
import { useCardKey, useEditMode } from "../lib/editMode";
import { useIsDemo } from "../lib/auth";
import { useCardSize, useToggleCard } from "../lib/dashboard";
import { CardSizePicker } from "./CardSizePicker";

/** Hold this long on a card to enter edit mode, as on a phone home screen. */
const LONG_PRESS_MS = 500;

export interface CardProps {
  title: string;
  children: ReactNode;
  /** Pillar key for the per-card accent tint (e.g. "weather", "tasks"). */
  pillar?: string;
  /**
   * Extra classes on the card's outer element. This is the single hook by which
   * anything outside a card can affect its tile — card-specific styling today,
   * and the grid-span classes when sizing lands (docs/ui-suite.md). Every card
   * must route through this shell for that to work, which is why the two
   * hand-rolled shells were folded back in.
   */
  className?: string;
  /**
   * Opt this card out of the shared fit pass and let its body scroll.
   *
   * The dashboard's rule is that a card fits its tile — a wall display nobody is
   * sitting at cannot be scrolled — and `useFitSections` enforces it by dropping
   * `data-drop-order` blocks until the body fits. Two cards are exempt (D10),
   * and gap 9 is that they are exempt for *different* reasons which this one
   * flag used to blur:
   *
   * - **Today genuinely scrolls.** Its content has no fixed extent and nothing
   *   in it is droppable, so the scrollbar is the honest answer.
   * - **News manages its own fit.** Its list clips and pages against a measured
   *   page size (5.11), so it never overflows and the scrollbar never appears.
   *   What it needs from this flag is the *other* half: that the shared drop
   *   pass keeps its hands off a card already deciding for itself how much to
   *   show. Two mechanisms competing over the same body is how the Weather
   *   regressions happened.
   *
   * Kept as one flag because both cases want the same two effects — no fit pass,
   * and a body that may scroll rather than crop if it ever does overflow. The
   * name describes the mechanism; this comment is the reason it is set.
   */
  scrollable?: boolean;
}

/**
 * Shared dashboard card shell.
 *
 * Owns three things every card gets for free: the glass tile, the no-scroll
 * guarantee (drops `data-drop-order` blocks until the body fits — see
 * `useFitSections`), and the edit-mode affordances. Putting the last of these
 * here rather than in a wrapper element keeps the card itself the grid item, so
 * edit mode adds no layout of its own and cannot disturb the grid.
 */
export function Card({ title, children, pillar, className: extra, scrollable }: CardProps) {
  const bodyRef = useFitSections<HTMLDivElement>();
  const cardKey = useCardKey();
  const { editing, start } = useEditMode();
  const { toggle } = useToggleCard();
  const size = useCardSize();
  const demo = useIsDemo();
  const pressTimer = useRef<number | null>(null);

  // A demo session's layout is read-only — `demoReadOnly` blocks every non-GET
  // server-side, so edit mode there is a set of controls that can only fail.
  // The header toggle has always been hidden for demo; the long-press was not,
  // which left a way in that no visible affordance advertised. Found while
  // adding presets, which put three of the most inviting buttons in the app
  // behind that same door.
  const canEdit = cardKey !== null && !demo;

  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const beginPress = () => {
    if (!canEdit || editing) return;
    cancelPress();
    pressTimer.current = window.setTimeout(start, LONG_PRESS_MS);
  };

  // Spans go on the card itself because the card *is* the grid item — edit mode
  // wraps it in a `display: contents` slot precisely so nothing else ever is.
  // Emitted as separate width/height classes rather than one per size, so the
  // five-size union costs three classes and adding a size costs none.
  const { w, h } = cardSpan(size);

  const className = [
    "card",
    pillar && `pillar-${pillar}`,
    editing && canEdit && "is-editing",
    w > 1 && `card-w${w}`,
    h > 1 && `card-h${h}`,
    extra,
  ]
    .filter(Boolean)
    .join(" ");

  const bodyClass = ["card-body", scrollable && "is-scrollable"].filter(Boolean).join(" ");

  return (
    <section
      className={className}
      onPointerDown={beginPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      // A drag across the card is a scroll or a selection, not a hold.
      onPointerMove={cancelPress}
    >
      {editing && canEdit && <CardSizePicker cardKey={cardKey} title={title} size={size} />}

      {editing && canEdit && (
        <button
          type="button"
          className="card-remove"
          onClick={() => toggle(cardKey)}
          aria-label={`Hide ${title} card`}
          title={`Hide ${title}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
        </button>
      )}

      <h2 className="card-title">
        <span className="card-dot" aria-hidden="true" />
        {title}
      </h2>

      <div className={bodyClass} ref={scrollable ? undefined : bodyRef}>
        {children}
      </div>
    </section>
  );
}
