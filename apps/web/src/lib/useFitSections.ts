import { useCallback, useEffect, useRef } from "react";

/**
 * Keep a card body from overflowing by dropping its least important sections.
 *
 * The companion to `useClampList`. That one thins a single list row by row; this
 * one drops whole sections, which is what non-list cards need — Weather and
 * Performance are fixed stacks of blocks (hero, details, outlook, trend chart),
 * so there is no list to thin.
 *
 * A card marks its optional blocks with `data-drop-order`, lowest dropped first:
 *
 *     <div className="perf-trend-block" data-drop-order="1">…</div>
 *
 * Anything unmarked is essential and is never dropped. A card with nothing
 * marked keeps its scrollbar — deliberately, because silently clipping a card
 * nobody has audited is worse than an honest scrollbar.
 *
 * Why thresholds are measured, not written down: a `@container (max-height: …)`
 * rule per card would hard-code the tile sizes that exist today, and Phase 2
 * introduces new ones. This asks the layout what actually fits, so it stays
 * correct at any size.
 */
export function useFitSections<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const measure = useCallback(() => {
    const body = ref.current;
    if (!body) return;

    const sections = Array.from(body.querySelectorAll<HTMLElement>("[data-drop-order]")).sort(
      (a, b) => Number(a.dataset.dropOrder) - Number(b.dataset.dropOrder),
    );
    if (sections.length === 0) return;

    // Restore everything first, so a card that has grown gets its sections back.
    // Measuring from the full layout each time also keeps this idempotent —
    // the result depends only on the current size, never on what was dropped before.
    for (const section of sections) section.classList.remove("is-dropped");

    // Reading scrollHeight forces the reflow, so each check sees the real layout.
    for (const section of sections) {
      if (body.scrollHeight <= body.clientHeight + 1) break;
      section.classList.add("is-dropped");
    }
  }, []);

  useEffect(() => {
    const body = ref.current;
    if (!body) return;

    measure();

    // The body's own box is fixed by the card, so dropping a child cannot resize
    // it — observing it is safe and cannot loop.
    const observer = new ResizeObserver(measure);
    observer.observe(body);

    // Content changes height without any resize: data arrives, a value wraps.
    const mutation = new MutationObserver(measure);
    mutation.observe(body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [measure]);

  return ref;
}
