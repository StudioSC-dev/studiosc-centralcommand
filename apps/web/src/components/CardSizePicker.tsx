import { useEffect, useRef, useState } from "react";
import { CARD_SIZES, cardSpan, type CardKey, type CardSize } from "@central-command/types";
import { useSetCardSize } from "../lib/dashboard";

/**
 * The resize control on a card, in edit mode.
 *
 * Lives in the card shell alongside the remove badge, for the same reason
 * (docs/ui-suite.md §"Why the shell hosts the affordances"): the card is the
 * grid item, so an affordance rendered anywhere else would put a layout box
 * between the grid and the thing being sized.
 *
 * Sizing had originally been planned as a settings control (Phase 4.7). Edit
 * mode replaced that surface in Phase 2, and building the settings version
 * would have been building it to delete it — the same trap that reordered these
 * phases in the first place.
 */
export function CardSizePicker({
  cardKey,
  title,
  size,
}: {
  cardKey: CardKey;
  title: string;
  size: CardSize;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const { setSize, allows } = useSetCardSize();

  // Click-away and Escape. Escape closes the popover *without* leaving edit
  // mode, so the key press has to stop here — the provider listens on window.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div
      className="card-size"
      ref={root}
      // A press here is for the picker, not for the drag that every other part
      // of a card in edit mode starts, and not for the long-press that enters
      // edit mode. Stopping it at the root covers the button and the popover.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="card-size-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Resize ${title} card (currently ${label(size)})`}
        title={`Resize — currently ${label(size)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <SizeGlyph size={size} />
      </button>

      {/* A single horizontal row of glyphs, not a labelled list. `.card` clips to
          its rounded corners, so a tall dropdown would be cut off by the bottom
          of a short tile — and the shortest tile is exactly the case where
          someone reaches for this control. The names live on the buttons'
          labels instead of taking vertical space. */}
      {open && (
        <div className="card-size-menu" role="menu" aria-label={`Size for ${title}`}>
          {CARD_SIZES.map((option) => {
            // Greyed out exactly when the server would refuse the write — both
            // sides call the same `fitsGrid`, so they cannot disagree (D5/D6).
            const fits = option === size || allows(cardKey, option);
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === size}
                className={`card-size-option${option === size ? " is-current" : ""}`}
                disabled={!fits}
                aria-label={label(option)}
                title={fits ? label(option) : `${label(option)} — no room on the grid`}
                onClick={() => {
                  setSize(cardKey, option);
                  setOpen(false);
                }}
              >
                <SizeGlyph size={option} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "2x1" reads as a filename; "2 x 1" with a real multiplication sign reads as a shape. */
function label(size: CardSize): string {
  const { w, h } = cardSpan(size);
  return `${w} × ${h}`;
}

/**
 * A miniature of the shape, drawn as a 3×2 cell field with the span filled in.
 * The label alone ("2 × 1") makes you translate; the picture does not.
 */
function SizeGlyph({ size }: { size: CardSize }) {
  const { w, h } = cardSpan(size);
  const cells = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      cells.push(
        <span
          key={`${row}-${col}`}
          className={`size-glyph-cell${col < w && row < h ? " is-on" : ""}`}
        />,
      );
    }
  }
  return (
    <span className="size-glyph" aria-hidden="true">
      {cells}
    </span>
  );
}
