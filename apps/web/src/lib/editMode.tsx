import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { CardKey } from "@central-command/types";

interface EditModeValue {
  editing: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

const EditModeContext = createContext<EditModeValue | null>(null);

/**
 * Dashboard edit mode — the Apple-homescreen-style arrangement surface.
 *
 * Lives above the route rather than inside the dashboard because the entry
 * control sits in the header, and the affordances it drives are inside each
 * card. Both need the same flag, and neither owns the other.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const start = useCallback(() => setEditing(true), []);
  const stop = useCallback(() => setEditing(false), []);
  const toggle = useCallback(() => setEditing((v) => !v), []);

  // Editing is a property of *looking at the dashboard*. Navigating away and
  // coming back to a still-jiggling grid would be a surprise.
  useEffect(() => {
    if (pathname !== "/") setEditing(false);
  }, [pathname]);

  // Escape is the expected way out of a mode.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const value = useMemo(() => ({ editing, start, stop, toggle }), [editing, start, stop, toggle]);
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}

export function useEditMode(): EditModeValue {
  const ctx = useContext(EditModeContext);
  // Cards render in tests and stories outside the provider; a no-op keeps them
  // renderable rather than throwing for a purely optional affordance.
  return ctx ?? { editing: false, start: () => {}, stop: () => {}, toggle: () => {} };
}

/**
 * The key of the card currently rendering.
 *
 * The dashboard supplies it around each card so the shared `Card` shell can
 * offer edit affordances without every card component having to thread its own
 * identity through. Deliberately not derived from the `pillar` prop: those two
 * happen to coincide today, and relying on that would break silently the first
 * time a card's accent and its key diverge.
 */
export const CardKeyContext = createContext<CardKey | null>(null);

export function useCardKey(): CardKey | null {
  return useContext(CardKeyContext);
}
