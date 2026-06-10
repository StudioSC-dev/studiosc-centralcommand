import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQueryOptions } from "../lib/auth";

/** Public sign-in screen. Already-authenticated visitors skip straight to the dashboard. */
export const Route = createFileRoute("/login")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (me) throw redirect({ to: "/" });
  },
  component: Login,
});

function Login() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <svg className="brand-mark login-mark" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3.2" />
          <line x1="12" y1="1.5" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22.5" y2="12" />
        </svg>
        <h1 className="login-title">Central Command</h1>
        <p className="login-sub">Your calendar, weather, fitness, gaming, and news in one place.</p>

        <a className="login-google" href="/api/auth/login/google">
          <svg viewBox="0 0 18 18" aria-hidden="true" className="login-google-icon">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Sign in with Google
        </a>

        <a className="login-demo" href="/api/auth/demo">
          View the demo (no sign-in)
        </a>

        <p className="login-fineprint">
          Calendar access is requested separately, later, and is read-only.{" "}
          <a href="/privacy">Privacy</a>
        </p>
      </div>
    </div>
  );
}
