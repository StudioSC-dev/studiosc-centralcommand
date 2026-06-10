import { useIsDemo } from "../lib/auth";

/** Read-only demo notice with a sign-in CTA. Renders nothing outside demo. */
export function DemoBanner() {
  if (!useIsDemo()) return null;
  return (
    <div className="demo-banner">
      <span>You're viewing a live read-only demo with sample data — changes are disabled.</span>
      <a className="demo-banner-cta" href="/api/auth/login/google">
        Sign in with Google
      </a>
    </div>
  );
}
