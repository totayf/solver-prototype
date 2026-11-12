import type { LessonHistoryEntry } from "@/entities/lesson";

/**
 * Whether a history entry can be sent again: it failed (or the server lost
 * it while it was being made) and the exact photo sent is still on the
 * device. A ready lesson deleted on the server has no photo left.
 */
export function canRetry(entry: LessonHistoryEntry): boolean {
  return entry.status === "failed" && Boolean(entry.uploadUri);
}
