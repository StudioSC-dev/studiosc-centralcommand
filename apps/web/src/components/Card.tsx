import { useRef, type ReactNode } from "react";
import { useFitSections } from "../lib/useFitSections";
import { useCardKey, useEditMode } from "../lib/editMode";
import { useToggleCard } from "../lib/dashboard";

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
   * Opt this card out of the no-scroll rule and let its body scroll.
   *
   * The dashboard's rule is that a card fits its tile — a wall display nobody is
   * sitting at cannot be scrolled. A feed is the honest exception: News has no
   * natural end, so there is no amount of trimming that makes it "fit", and
   * scrolling is what the content is actually for.
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
  const pressTimer = useRef<number | null>(null);

  const canEdit = cardKey !== null;

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

  const className = [
    "card",
    pillar && `pillar-${pillar}`,
    editing && canEdit && "is-editing",
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
