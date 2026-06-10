import { Outlet, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppHeader } from "../components/AppHeader";

/** Context available to every route — the shared TanStack Query client. */
export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

/** Routes that render without the app chrome (you're not "inside" the app yet). */
const CHROMELESS = new Set(["/login"]);

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showHeader = !CHROMELESS.has(pathname);
  return (
    <div className="app-shell">
      {showHeader && <AppHeader />}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
