import { Link } from "@tanstack/react-router";
import { useTheme } from "../lib/theme";
import { useNow } from "../lib/clock";
import { useLogout, useMe } from "../lib/auth";
import { useProfile } from "../lib/profile";

/** Time-of-day greeting prefix. */
function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Top bar: brand + greeting on the left, live clock + theme toggle on the right. */
export function AppHeader() {
  const now = useNow();
  const { data: profileData } = useProfile();
  // Greet by first name only; hidden entirely when no name is set.
  const firstName = profileData?.profile?.displayName?.trim().split(/\s+/)[0] || null;
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
        {firstName && (
          <span className="header-greeting">
            {greetingFor(now.getHours())}, {firstName}
          </span>
        )}
      </div>
      <div className="header-tools">
        <time className="header-clock">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </time>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

/** Identity + sign-out, shown only once a session exists. */
function UserMenu() {
  const { data: me } = useMe();
  const logout = useLogout();
  if (!me) return null;

  return (
    <div className="header-user">
      {me.demo ? (
        <span className="header-demo-badge">Demo</span>
      ) : (
        <>
          <Link to="/profile" className="header-email" title="Edit profile">
            {me.email}
          </Link>
          <Link to="/settings" className="icon-button" aria-label="Settings" title="Settings">
            <svg className="gear-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </>
      )}
      <button
        type="button"
        className="link-button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        {me.demo ? "Exit demo" : "Sign out"}
      </button>
    </div>
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
