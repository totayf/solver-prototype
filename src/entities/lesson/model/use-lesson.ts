import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { isTransientError } from "@/shared/api/friendly-error";

import { useLessonHistory } from "./lesson-history";
import {
  fetchLessonState,
  lessonPoller,
  lessonQueryKey,
  syncHistory,
} from "./pending-lessons";
import type { LessonState } from "./types";

/**
 * A lesson by id as `pending | ready | failed`. While it is pending the
 * app-wide poller keeps the state fresh (this screen starts it if nothing
 * else has); `error` is only temporary trouble (offline) with no state yet.
 * A ready lesson is refetched after a while, since its media URLs may be
 * short-lived.
 */
export function useLesson(id: string) {
  const { data: history } = useLessonHistory();
  const entry = history?.find((e) => e.id === id);
  const query = useQuery({
    queryKey: lessonQueryKey(id),
    queryFn: async ({ signal }) => {
      const state = await fetchLessonState(id, signal);
      void syncHistory(state).catch(() => undefined);
      return state;
    },
    staleTime: (q) =>
      q.state.data?.status === "ready" ? READY_FRESH_MS : PENDING_FRESH_MS,
    retry: (count, error) => count < 2 && isTransientError(error),
  });

  const state: LessonState | undefined = query.data;
  // Trust the server's answer once there is one; until then, the history.
  const pending = state
    ? state.status === "pending"
    : entry?.status === "pending";
  const createdAt = entry?.createdAt;
  useEffect(() => {
    if (pending) lessonPoller.watch({ id, createdAt: createdAt ?? Date.now() });
  }, [pending, id, createdAt]);

  // A lesson in the history keeps polling after this screen closes (it waits
  // there); any other one stops with the screen.
  const inHistory = useRef(false);
  inHistory.current = entry !== undefined;
  useEffect(
    () => () => {
      if (!inHistory.current) lessonPoller.unwatch(id);
    },
    [id],
  );

  return {
    state,
    /** The history entry, if this lesson is one of the student's own. */
    entry,
    error: query.data ? null : query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Well within the 24 h life of signed media URLs. */
const READY_FRESH_MS = 30 * 60_000;
/** The poller writes pending states; a remount shouldn't refetch at once. */
const PENDING_FRESH_MS = 1_000;
