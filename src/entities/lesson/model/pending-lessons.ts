import { useEffect } from "react";
import { AppState } from "react-native";

import { queryClient } from "@/shared/api/query-client";
import { requestJson } from "@/shared/api/request-json";

import {
  pendingEntries,
  withFailed,
  withPending,
  withReady,
  withoutEntry,
  withStage,
} from "./history-model";
import { readHistory, saveUpload, updateHistory } from "./lesson-history";
import { createLessonPoller } from "./lesson-poller";
import { stateFromBody, stateFromError } from "./lesson-state";
import type {
  GenerationStage,
  Lesson,
  LessonState,
  PendingLesson,
} from "./types";

export const lessonQueryKey = (id: string) => ["lesson", id] as const;

/**
 * One GET of a lesson as a state: ready, pending (202) or failed (a refusal,
 * 404 gone). Temporary trouble (offline, 503, timeout) throws.
 */
export async function fetchLessonState(
  id: string,
  signal?: AbortSignal,
): Promise<LessonState> {
  try {
    const body = await requestJson<Lesson | PendingLesson>(
      `/api/lessons/${encodeURIComponent(id)}`,
      { signal },
    );
    return stateFromBody(id, body);
  } catch (error) {
    return stateFromError(id, error);
  }
}

/**
 * The server accepted a photo (202): the lesson is in the history from this
 * moment, with the photo kept for a retry, and polled in the background
 * until it is ready — leaving the screen or the app loses nothing.
 * `replaces` is the failed entry a retry came from.
 */
export async function rememberPendingLesson({
  id,
  stage,
  image,
  replaces,
}: {
  id: string;
  stage: GenerationStage;
  /** The exact base64 JPEG that was sent. */
  image: string;
  replaces?: string;
}): Promise<void> {
  const createdAt = Date.now();
  const uploadUri = saveUpload(id, image);
  queryClient.setQueryData<LessonState>(lessonQueryKey(id), (current) =>
    current?.status === "ready" ? current : { status: "pending", id, stage },
  );
  try {
    const history = await updateHistory((h) =>
      withPending(h, { id, stage, createdAt, uploadUri, replaces }),
    );
    const entry = history.find((e) => e.id === id);
    if (entry && entry.status !== "pending") return;
    lessonPoller.watch(entry ?? { id, createdAt });
  } catch (error) {
    // The lesson is on its way even if the list couldn't be saved: keep polling.
    console.warn("[lesson-history] could not save the pending lesson", error);
    lessonPoller.watch({ id, createdAt });
  }
}

/** A finished lesson that arrived in one answer (older servers): cache and list it. */
export async function rememberReadyLesson(
  lesson: Lesson,
  replaces?: string,
): Promise<void> {
  queryClient.setQueryData<LessonState>(lessonQueryKey(lesson.id), {
    status: "ready",
    lesson,
  });
  await updateHistory((h) =>
    withReady(
      replaces && replaces !== lesson.id ? withoutEntry(h, replaces) : h,
      lesson,
    ),
  );
}

/**
 * Brings a lesson's history entry in line with what the server said
 * (no-op for lessons that aren't in the history, like the examples).
 */
export function syncHistory(state: LessonState): Promise<unknown> {
  switch (state.status) {
    case "pending":
      return updateHistory((h) => withStage(h, state.id, state.stage));
    case "ready":
      return updateHistory((h) =>
        h.some((e) => e.id === state.lesson.id)
          ? withReady(h, state.lesson)
          : h,
      );
    case "failed":
      return updateHistory((h) => withFailed(h, state.id, state.error));
  }
}

/**
 * Keeps polling every lesson still being generated: on app start, and again
 * at once whenever the app comes back to the foreground. Polling pauses in
 * the background. Mount once, near the root.
 */
export function useResumePendingLessons() {
  useEffect(() => {
    const resumeAll = async () => {
      for (const entry of pendingEntries(await readHistory())) {
        lessonPoller.watch(entry);
      }
      lessonPoller.resume();
    };
    void resumeAll();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void resumeAll();
      else if (state === "background") lessonPoller.pause();
    });
    return () => subscription.remove();
  }, []);
}

/** The app-wide poller: its results land in the lesson cache and the history. */
export const lessonPoller = createLessonPoller({
  fetchState: fetchLessonState,
  onState: (id, state) => {
    queryClient.setQueryData<LessonState>(lessonQueryKey(id), state);
    void syncHistory(state).catch((error: unknown) =>
      console.warn("[lesson-history] update failed", error),
    );
  },
  now: Date.now,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
});
