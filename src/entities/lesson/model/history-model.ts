import type { GenerationStage, Lesson, LessonFailure } from "./types";

/**
 * Pure rules for the lesson history kept on the device: a lesson enters it
 * as `pending` the moment the server accepts the photo (so leaving the app
 * mid-generation loses nothing), becomes `ready` with its title and answer,
 * or `failed` with a message for the student. Every change returns a new
 * list, or the same list when nothing changed (so no write is needed).
 */

/** Reads the stored JSON, accepting entries written by older builds (always ready). */
export function normalizeHistory(raw: unknown): LessonHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): LessonHistoryEntry[] => {
    if (typeof item !== "object" || item === null) return [];
    const entry = item as Partial<LessonHistoryEntry> & Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id.length === 0) return [];
    const createdAt =
      typeof entry.createdAt === "number" ? entry.createdAt : Date.now();
    const uploadUri =
      typeof entry.uploadUri === "string" ? entry.uploadUri : undefined;

    if (entry.status === "pending") {
      return [
        {
          id: entry.id,
          createdAt,
          status: "pending",
          stage: (entry.stage as GenerationStage) ?? "reading",
          uploadUri,
        },
      ];
    }
    if (entry.status === "failed") {
      const error = entry.error as LessonFailure | undefined;
      return [
        {
          id: entry.id,
          createdAt,
          status: "failed",
          error: {
            kind: error?.kind ?? "failed",
            message: error?.message ?? FAILED_FALLBACK,
          },
          uploadUri,
        },
      ];
    }
    if (typeof entry.title !== "string") return [];
    return [
      {
        id: entry.id,
        createdAt,
        status: "ready",
        title: entry.title,
        answer: typeof entry.answer === "string" ? entry.answer : "",
        durationMs: typeof entry.durationMs === "number" ? entry.durationMs : 0,
      },
    ];
  });
}

/**
 * The server accepted a photo: the lesson goes to the top as pending. A job
 * the server joined that is already in the list keeps its entry (a ready one
 * stays ready); `replaces` drops the failed entry a retry came from.
 */
export function withPending(
  history: LessonHistoryEntry[],
  pending: {
    id: string;
    stage: GenerationStage;
    createdAt: number;
    uploadUri?: string;
    replaces?: string;
  },
): LessonHistoryEntry[] {
  const existing = history.find((entry) => entry.id === pending.id);
  const rest = history.filter(
    (entry) => entry.id !== pending.id && entry.id !== pending.replaces,
  );
  const entry: LessonHistoryEntry =
    existing?.status === "ready"
      ? existing
      : {
          id: pending.id,
          // Joining a job that is still running keeps its start (and deadline).
          createdAt:
            existing?.status === "pending"
              ? existing.createdAt
              : pending.createdAt,
          status: "pending",
          stage: pending.stage,
          uploadUri: pending.uploadUri ?? existing?.uploadUri,
        };
  return capHistory([entry, ...rest]);
}

/** Stage updates while polling; the same list when nothing changed. */
export function withStage(
  history: LessonHistoryEntry[],
  id: string,
  stage: GenerationStage,
): LessonHistoryEntry[] {
  const index = history.findIndex((entry) => entry.id === id);
  const entry = history[index];
  if (!entry || entry.status !== "pending" || entry.stage === stage) {
    return history;
  }
  return replaceAt(history, index, { ...entry, stage });
}

/**
 * A finished lesson: its pending entry becomes ready in place (keeping its
 * date); a lesson not in the list yet (an older server answered the POST
 * with the whole lesson) goes to the top. Already ready: unchanged.
 */
export function withReady(
  history: LessonHistoryEntry[],
  lesson: Pick<Lesson, "id" | "title" | "answer" | "audio">,
  now = Date.now(),
): LessonHistoryEntry[] {
  const index = history.findIndex((entry) => entry.id === lesson.id);
  const existing = history[index];
  if (existing?.status === "ready") return history;

  const others = history.filter((entry) => entry.id !== lesson.id);
  const ready: LessonHistoryEntry = {
    id: lesson.id,
    createdAt: existing?.createdAt ?? now,
    status: "ready",
    title: numberedTitle(lesson.title, others),
    answer: lesson.answer,
    durationMs: lesson.audio.durationMs,
  };
  return existing
    ? replaceAt(history, index, ready)
    : capHistory([ready, ...history]);
}

/** Generation failed or the lesson is gone; only entries already listed change. */
export function withFailed(
  history: LessonHistoryEntry[],
  id: string,
  error: LessonFailure,
): LessonHistoryEntry[] {
  const index = history.findIndex((entry) => entry.id === id);
  const entry = history[index];
  if (!entry) return history;
  if (
    entry.status === "failed" &&
    entry.error.kind === error.kind &&
    entry.error.message === error.message
  ) {
    return history;
  }
  return replaceAt(history, index, {
    id,
    createdAt: entry.createdAt,
    status: "failed",
    error,
    uploadUri: entry.status === "ready" ? undefined : entry.uploadUri,
  });
}

export function withoutEntry(
  history: LessonHistoryEntry[],
  id: string,
): LessonHistoryEntry[] {
  return history.some((entry) => entry.id === id)
    ? history.filter((entry) => entry.id !== id)
    : history;
}

export function pendingEntries(
  history: LessonHistoryEntry[],
): PendingHistoryEntry[] {
  return history.filter(
    (entry): entry is PendingHistoryEntry => entry.status === "pending",
  );
}

/** Local photo copies no entry needs any more (removed, or the lesson is ready). */
export function droppedUploads(
  before: LessonHistoryEntry[],
  after: LessonHistoryEntry[],
): string[] {
  const kept = new Set(after.flatMap(uploadOf));
  return before.flatMap(uploadOf).filter((uri) => !kept.has(uri));
}

/** Newest first, at most MAX_ENTRIES; lessons still being made are never dropped. */
export function capHistory(
  history: LessonHistoryEntry[],
): LessonHistoryEntry[] {
  if (history.length <= MAX_ENTRIES) return history;
  let room = MAX_ENTRIES - history.filter((e) => e.status === "pending").length;
  return history.filter((entry) => entry.status === "pending" || room-- > 0);
}

/** "Türkçe / Sözcükte Anlam" → "… 1", "… 2" as the same topic comes up again. */
export function numberedTitle(
  title: string,
  history: LessonHistoryEntry[],
): string {
  const pattern = new RegExp(`^${escapeRegExp(title)} (\\d+)$`);
  const used = history
    .map((entry) =>
      entry.status === "ready" ? pattern.exec(entry.title)?.[1] : undefined,
    )
    .filter((n) => n !== undefined)
    .map(Number);
  return `${title} ${Math.max(0, ...used) + 1}`;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_ENTRIES = 30;
const FAILED_FALLBACK = "Ders hazırlanamadı. Tekrar dene.";

// ── Helpers ──────────────────────────────────────────────────────────────────

function replaceAt(
  history: LessonHistoryEntry[],
  index: number,
  entry: LessonHistoryEntry,
): LessonHistoryEntry[] {
  return history.map((item, i) => (i === index ? entry : item));
}

function uploadOf(entry: LessonHistoryEntry): string[] {
  return entry.status !== "ready" && entry.uploadUri ? [entry.uploadUri] : [];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Types ────────────────────────────────────────────────────────────────────

interface EntryBase {
  id: string;
  createdAt: number;
}

export interface PendingHistoryEntry extends EntryBase {
  status: "pending";
  stage: GenerationStage;
  /** Local copy of the photo sent: the row's thumbnail and what "Tekrar dene" re-sends. */
  uploadUri?: string;
}

export interface ReadyHistoryEntry extends EntryBase {
  status: "ready";
  title: string;
  answer: string;
  durationMs: number;
}

export interface FailedHistoryEntry extends EntryBase {
  status: "failed";
  error: LessonFailure;
  uploadUri?: string;
}

export type LessonHistoryEntry =
  | PendingHistoryEntry
  | ReadyHistoryEntry
  | FailedHistoryEntry;
