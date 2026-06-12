import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 s
      gcTime: 5 * 60 * 1000,   // 5 dk
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
