import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type GenerationStage,
  type Lesson,
  lessonQueryKey,
  type PendingLesson,
  useRememberLesson,
} from "@/entities/lesson";
import { RequestError, requestJson } from "@/shared/api/request-json";

import type { PixelRect } from "../lib/crop-image";
import { prepareImage } from "../lib/prepare-image";

/**
 * Photo (and the question's crop) → finished lesson, cached for the lesson
 * screen and kept in history. The server answers at once with a pending id
 * and the app polls it, so a dropped connection during the minute of
 * generation only costs a retried poll, not the lesson. (A server that still
 * answers the POST with the whole lesson works too.)
 */
export function useCreateLesson({
  onStage,
}: {
  /** The server's progress while the lesson is being made. */
  onStage?: (stage: GenerationStage) => void;
} = {}) {
  const queryClient = useQueryClient();
  const rememberLesson = useRememberLesson();

  return useMutation({
    mutationFn: async ({ uri, crop }: { uri: string; crop?: PixelRect }) => {
      const image = await prepareImage(uri, crop);
      const started = await requestJson<Lesson | PendingLesson>(
        "/api/lessons",
        {
          method: "POST",
          // Answer at once with an id to poll; servers that ignore it send the lesson.
          headers: { prefer: "respond-async" },
          body: JSON.stringify({ image }),
        },
      );
      if (!isPending(started)) return started;
      onStage?.(started.stage);
      return waitForLesson(started.id, onStage);
    },
    onSuccess: async (lesson) => {
      queryClient.setQueryData(lessonQueryKey(lesson.id), lesson);
      await rememberLesson(lesson);
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForLesson(
  id: string,
  onStage?: (stage: GenerationStage) => void,
): Promise<Lesson> {
  const deadline = Date.now() + MAX_WAIT_MS;
  let failures = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let body: Lesson | PendingLesson;
    try {
      body = await requestJson<Lesson | PendingLesson>(`/api/lessons/${id}`);
      failures = 0;
    } catch (error) {
      // Signal lost or a gateway hiccup: the lesson is still being made.
      if (isTransient(error) && ++failures < MAX_FAILED_POLLS) continue;
      throw error;
    }
    if (!isPending(body)) return body;
    onStage?.(body.stage);
  }
  throw new Error(
    "Ders beklenenden uzun sürdü. Biraz sonra tekrar dene; hazırsa hemen açılır.",
  );
}

function isPending(body: Lesson | PendingLesson): body is PendingLesson {
  return "status" in body && body.status === "pending";
}

function isTransient(error: unknown): boolean {
  return !(error instanceof RequestError) || error.status >= 502;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 1_500;
/** Generation takes 1–2 minutes; the server gives up on a model call well within this. */
const MAX_WAIT_MS = 8 * 60_000;
/** Consecutive failed polls (no signal) before telling the student. */
const MAX_FAILED_POLLS = 8;
