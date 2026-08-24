import { useCallback, useEffect, useState } from "react";

/**
 * Hide the list items that do not *fully* fit the space the list has, and
 * report how many were hidden.
 *
 * This is the dashboard's answer to "a card must never scroll". The naive fix —
 * a `slice(0, N)` per card — encodes one tile size as a constant, so every N is
 * wrong again the moment a card is resized (Phase 2) or the grid reshapes
 * because a card was hidden (Phase 1). This measures instead, so it is correct
 * at every tile size and needs no retuning.
 *
 * **Why it hides rather than slices.** Item heights here are not uniform — an
 * insight's detail wraps, the calendar has a divider row, a task row grows while
 * being edited — so "how many fit" cannot be computed from one row's height; it
 * has to come from each item's real box. Slicing in React would remove the very
 * elements whose boxes the next measurement depends on, so the list would have
 * no way to know an item could fit again once the card grew. Keeping every item
 * mounted and toggling `visibility` preserves the layout boxes, which keeps the
 * measurement valid in both directions.
 *
 * `visibility: hidden` is also the one way to hide something without touching
 * layout — so toggling it cannot itself trigger the ResizeObserver that
 * scheduled it, which is what would otherwise loop.
 *
 * Requires the list element to be sized to the available space and to clip:
 * `flex: 1 1 0; min-height: 0; overflow: hidden`.
 */
export function useClampList<T extends HTMLElement>() {
  /**
   * A callback ref, deliberately, rather than a `useRef` object.
   *
   * Several cards render the list *conditionally* — a League queue with no
   * games, a calendar with nothing upcoming, a news tab with no headlines — so
   * the element mounts and unmounts during normal use. Mutating a ref object
   * does not re-run an effect, so the observers stayed bound to the previous,
   * now-detached node: after switching away from an empty tab and back, nothing
   * ever fired again and `clippedCount` silently froze at its last value. Node
   * identity has to be state for the effect to follow it.
   */
  const [list, setList] = useState<T | null>(null);
  const [clippedCount, setClippedCount] = useState(0);
  const ref = useCallback((element: T | null) => setList(element), []);

  const measure = useCallback(() => {
    if (!list) return;

    // The list's own padding box is the space it may occupy; anything whose
    // bottom edge falls past it is not fully visible.
    const limit = list.getBoundingClientRect().top + list.clientHeight;
    let clipped = 0;

    const children = Array.from(list.children) as HTMLElement[];
    children.forEach((child, index) => {
      // The first row is never hidden. On a tile too short for even one row
      // every row measures as clipped, and the list then renders as blank space
      // underneath a footer still claiming there is content — which is what a
      // short News card actually did. A row cut off by the list's own clipping
      // is honest about there being more; emptiness is not.
      //
      // Sub-pixel tolerance: a row whose bottom lands exactly on the boundary
      // is visible, and fractional layout should not count it as clipped.
      const fits = index === 0 || child.getBoundingClientRect().bottom <= limit + 0.5;
      child.classList.toggle("is-clipped", !fits);
      if (!fits) clipped += 1;
    });

    setClippedCount((prev) => (prev === clipped ? prev : clipped));
  }, [list]);

  useEffect(() => {
    if (!list) {
      // Nothing mounted: report nothing clipped, so a stale count from the
      // previous list cannot outlive it.
      setClippedCount(0);
      return;
    }

    measure();

    // Observe the list (the card was resized) and every row (its own content
    // changed height — a wrapping title, an inline editor opening).
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const child of Array.from(list.children)) observer.observe(child);

    // Rows are added and removed by data changes, not just resizes.
    const mutation = new MutationObserver(() => {
      observer.disconnect();
      observer.observe(list);
      for (const child of Array.from(list.children)) observer.observe(child);
      measure();
    });
    mutation.observe(list, { childList: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [list, measure]);

  return { ref, clippedCount };
}
