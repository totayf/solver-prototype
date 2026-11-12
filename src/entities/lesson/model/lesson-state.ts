import { friendlyError, isTransientError } from "@/shared/api/friendly-error";

import type {
  GenerationStage,
  Lesson,
  LessonFailure,
  LessonState,
  PendingLesson,
} from "./types";

/**
 * Pure rules for reading `GET /api/lessons/<id>` (and the POST that starts a
 * lesson): 200 lesson → ready, 202 → pending with the server's stage. A final
 * error answer becomes a `failed` state (404 → gone, a 500 refusal keeps the
 * server's Turkish sentence); anything temporary is rethrown so the caller
 * keeps polling or retries.
 */
export function stateFromBody(
  id: string,
  body: Lesson | PendingLesson,
): LessonState {
  if (isPendingBody(body)) {
    return {
      status: "pending",
      id: body.id || id,
      stage: knownStage(body.stage),
    };
  }
  return { status: "ready", lesson: body };
}

/** A final failure as a state; temporary errors (offline, 503, …) are rethrown. */
export function stateFromError(id: string, error: unknown): LessonState {
  if (isTransientError(error)) throw error;
  return { status: "failed", id, error: lessonFailure(error) };
}

/** Turkish, student-facing reason for any lesson error. */
export function lessonFailure(error: unknown): LessonFailure {
  const { kind, message } = friendlyError(error, LESSON_COPY);
  return {
    kind:
      kind === "gone" || kind === "failed" || kind === "outdated"
        ? kind
        : "other",
    message,
  };
}

export function isPendingBody(
  body: Lesson | PendingLesson,
): body is PendingLesson {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "pending"
  );
}

/** Wording per kind when a lesson is what went wrong. */
export const LESSON_COPY = {
  gone: "Bu ders artık yok.",
  failed: "Ders hazırlanamadı. Tekrar dene.",
} as const;

/** Shown when a lesson is still not ready at the polling deadline. */
export const TOO_LONG: LessonFailure = {
  kind: "failed",
  message: "Ders beklenenden uzun sürdü. Tekrar dene; hazırsa hemen açılır.",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Older or newer servers may name a stage we don't know: show it as the first. */
function knownStage(stage: unknown): GenerationStage {
  return STAGES.includes(stage as GenerationStage)
    ? (stage as GenerationStage)
    : "reading";
}

const STAGES: GenerationStage[] = ["reading", "solving", "writing", "voicing"];
