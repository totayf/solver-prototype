import { createHash } from "node:crypto";

import type { GenerationStage, Lesson } from "@/entities/lesson";
import type { LessonModel } from "@/shared/server/ai";
import type { Bytes } from "@/shared/server/lesson-store";

import {
  createLesson,
  getLesson,
  LessonError,
  newLessonId,
} from "./create-lesson.service";

/**
 * Lesson generation as a job: the request that starts it answers at once with
 * the lesson id, and the app polls `GET /api/lessons/<id>` until the lesson is
 * there. A phone that drops its connection during the minute of generation
 * loses nothing, and the same photo sent again while it is being made (a
 * retry, a double tap) joins the running job instead of paying for a second
 * lesson.
 *
 * Kept in memory: right for one long-running server. Behind several
 * instances, these maps belong in shared storage (Redis or the database) with
 * a queue in front of `createLesson`.
 */
export async function startLessonJob({
  image,
  mediaType,
  model,
}: {
  image: Bytes;
  mediaType: string;
  model?: LessonModel;
}): Promise<LessonJob> {
  const key = imageKey(image, model);
  const sameImage = byImage.get(key);
  if (sameImage) {
    const running = jobs.get(sameImage);
    if (running) return running;
    const lesson = await getLesson(sameImage);
    // Deleted meanwhile (history cleared): make it again.
    if (lesson) return finishedJob(lesson);
    forget(key, sameImage);
  }

  // A double tap may have started the job while we looked for the old lesson.
  const started = jobs.get(byImage.get(key) ?? "");
  if (started) return started;

  const id = newLessonId();
  // The job exists before generation starts: the first stage is reported synchronously.
  const job = { id, stage: "reading", error: null } as LessonJob;
  job.done = createLesson({
    id,
    image,
    mediaType,
    model,
    onStage: (stage) => {
      job.stage = stage;
    },
  });
  jobs.set(id, job);
  byImage.set(key, id);

  job.done.then(
    () => {
      // lesson.json is the record now; remember the photo a while for retries.
      jobs.delete(id);
      later(() => forget(key, id), RECENT_MS);
    },
    (error: unknown) => {
      console.error(`[lesson ${id}] generation failed`, error);
      job.error = error instanceof LessonError ? error.message : GENERIC_ERROR;
      // A retry of the same photo starts afresh; pollers still get the error.
      forget(key, id);
      later(() => jobs.delete(id), FAILED_KEPT_MS);
    },
  );
  return job;
}

/** The running (or failed) job for a lesson id; undefined once the lesson is stored. */
export function lessonJob(id: string): LessonJob | undefined {
  return jobs.get(id);
}

export interface LessonJob {
  id: string;
  stage: GenerationStage;
  /** Set when generation failed: the Turkish message to show. */
  error: string | null;
  /** Settles when generation ends; for callers that choose to wait. */
  done: Promise<Lesson>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const jobs = new Map<string, LessonJob>();
/** Photo (and pinned model) → lesson id, while running and for RECENT_MS after. */
const byImage = new Map<string, string>();

const RECENT_MS = 10 * 60_000;
const FAILED_KEPT_MS = 10 * 60_000;
const GENERIC_ERROR = "Ders oluşturulamadı, tekrar dene.";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A just-finished lesson for the same photo, answered like a job. */
function finishedJob(lesson: Lesson): LessonJob {
  return {
    id: lesson.id,
    stage: "voicing",
    error: null,
    done: Promise.resolve(lesson),
  };
}

function imageKey(image: Bytes, model: LessonModel | undefined): string {
  const digest = createHash("sha256").update(image).digest("hex");
  return `${digest}:${model ?? "default"}`;
}

function forget(key: string, id: string): void {
  if (byImage.get(key) === id) byImage.delete(key);
}

/** A timer that never keeps the process alive on its own. */
function later(run: () => void, ms: number): void {
  const timer = setTimeout(run, ms) as { unref?: () => void };
  timer.unref?.();
}
