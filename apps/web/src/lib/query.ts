import { QueryClient } from "@tanstack/react-query";

/** Shared TanStack Query client. Pairs with the KV cache on the API side. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
