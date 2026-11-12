import type { LessonHistoryEntry } from "@/entities/lesson";

/**
 * Which history entries still need a delete on the server: lessons the
 * server already doesn't know (404 "gone") only leave the list.
 */
export function needsServerDelete(entry: LessonHistoryEntry): boolean {
  return !(entry.status === "failed" && entry.error.kind === "gone");
}

/** Split a batch of delete results into ids to drop from the list and ids that failed. */
export function splitResults(results: Array<{ id: string; ok: boolean }>): {
  removed: string[];
  failed: string[];
} {
  return {
    removed: results.filter((r) => r.ok).map((r) => r.id),
    failed: results.filter((r) => !r.ok).map((r) => r.id),
  };
}
