import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "cc-theme";

/** Read the theme the inline boot script already applied to <html>. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Light/dark theme with localStorage persistence. The initial value is applied
 * by an inline script in index.html (before paint, to avoid a flash); this hook
 * keeps React in sync and writes changes back.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / storage disabled — theme just won't persist.
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}
