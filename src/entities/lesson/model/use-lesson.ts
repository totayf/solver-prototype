import { useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/api/request-json";

import type { Lesson } from "./types";

export const lessonQueryKey = (id: string) => ["lesson", id] as const;

/** A generated lesson by id (cached forever — lessons never change). */
export function useLesson(id: string) {
  return useQuery({
    queryKey: lessonQueryKey(id),
    queryFn: () => requestJson<Lesson>(`/api/lessons/${id}`),
  });
}
