import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

/** Context available to every route — the shared TanStack Query client. */
export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Central Command</h1>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
