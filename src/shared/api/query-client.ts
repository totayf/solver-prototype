import { QueryClient } from "@tanstack/react-query";

/** One client per app process. Lessons never change once generated. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Number.POSITIVE_INFINITY, retry: 1 },
  },
});
