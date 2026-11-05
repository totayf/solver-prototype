import { useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/api/request-json";

import type { ExampleCatalog } from "./types";

export const EXAMPLES_QUERY_KEY = ["examples"] as const;

/** The example catalog: questions per exam and the lessons made so far. */
export function useExamples() {
  return useQuery({
    queryKey: EXAMPLES_QUERY_KEY,
    queryFn: () => requestJson<ExampleCatalog>("/api/examples"),
  });
}
