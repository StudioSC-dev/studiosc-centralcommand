import { useTheme } from "../lib/theme";
import { useNow } from "../lib/clock";

/** Time-of-day greeting. Name-less until real auth provides a display name. */
function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Top bar: brand + greeting on the left, live clock + theme toggle on the right. */
export function AppHeader() {
  const now = useNow();
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.2" />
            <line x1="12" y1="1.5" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22.5" y2="12" />
          </svg>
          <span className="brand-name">Central Command</span>
        </div>
        <span className="header-greeting">{greetingFor(now.getHours())}</span>
      </div>
      <div className="header-tools">
        <time className="header-clock">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </time>
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        // Sun
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <line x1="12" y1="1.5" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22.5" y2="12" />
          <line x1="4.2" y1="4.2" x2="6" y2="6" />
          <line x1="18" y1="18" x2="19.8" y2="19.8" />
          <line x1="4.2" y1="19.8" x2="6" y2="18" />
          <line x1="18" y1="6" x2="19.8" y2="4.2" />
        </svg>
      ) : (
        // Moon
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
