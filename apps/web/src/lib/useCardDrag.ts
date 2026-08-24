import { useCallback, useRef, useState } from "react";

/** Movement past this many pixels turns a press into a drag. */
const DRAG_THRESHOLD_PX = 6;

interface DragState {
  /** Index of the card being dragged, within the visible list. */
  from: number;
  /** Index it would drop into right now. */
  over: number;
}

/**
 * Drag-to-reorder for the dashboard grid, on native pointer events.
 *
 * No drag library: every serious one is a new dependency (which this repo makes
 * you justify), and none of them would have given us the keyboard path that
 * matters more here — the settings list that used to be the accessible way to
 * manage layout is gone. Pointer events cover mouse, touch and pen in one code
 * path, and the grid is uniform 1×1 tiles, which makes "which cell am I over"
 * a hit test rather than a layout solver.
 *
 * The drop target is computed from the *midpoints* of the rendered tiles rather
 * than from a grid-maths guess, so it stays correct at any column count and
 * needs no knowledge of the current shape.
 */
export function useCardDrag(onMove: (from: number, to: number) => void) {
  const gridRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const origin = useRef<{ x: number; y: number; index: number } | null>(null);
  const started = useRef(false);

  /** Index of the tile whose centre is nearest the pointer. */
  const indexAt = useCallback((x: number, y: number): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;

    // Measure the cards, NOT `grid.children`. In edit mode each card is wrapped
    // in a `.card-slot` that is `display: contents` — deliberately, so the card
    // itself stays the grid item — and an element with `display: contents`
    // generates no box at all, so its `getBoundingClientRect()` is all zeros.
    // Measuring the wrappers put every tile's centre at (0,0) and made the drop
    // target meaningless. `.card` is the element the grid actually places, and
    // `querySelectorAll` returns them in DOM order, which is index order.
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>(".card"));
    let best: number | null = null;
    let bestDistance = Infinity;

    tiles.forEach((tile, index) => {
      const box = tile.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return; // never match an unlaid-out box
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height / 2);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });

    return best;
  }, []);

  const onPointerDown = useCallback((index: number, e: React.PointerEvent) => {
    // Primary button / single touch only — a right-click or a second finger
    // should not start rearranging the dashboard.
    if (e.button !== 0) return;
    origin.current = { x: e.clientX, y: e.clientY, index };
    started.current = false;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const from = origin.current;
      if (!from) return;

      if (!started.current) {
        const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        started.current = true;
        // Capture so the drag survives the pointer leaving the card it began on.
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }

      const over = indexAt(e.clientX, e.clientY);
      setDrag({ from: from.index, over: over ?? from.index });
    },
    [indexAt],
  );

  const onPointerUp = useCallback(() => {
    if (started.current && drag && drag.over !== drag.from) {
      onMove(drag.from, drag.over);
    }
    origin.current = null;
    started.current = false;
    setDrag(null);
  }, [drag, onMove]);

  const cancel = useCallback(() => {
    origin.current = null;
    started.current = false;
    setDrag(null);
  }, []);

  return {
    gridRef,
    // Non-null only once the movement threshold is passed — `drag` is not set
    // until then — so a click never looks like a drag.
    drag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel },
  };
}
