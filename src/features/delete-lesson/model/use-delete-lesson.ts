import { useQueryClient } from "@tanstack/react-query";

import {
  type LessonHistoryEntry,
  lessonPoller,
  lessonQueryKey,
  readHistory,
  updateHistory,
  withoutEntry,
} from "@/entities/lesson";
import { RequestError, requestJson } from "@/shared/api/request-json";

import { needsServerDelete, splitResults } from "../lib/delete-plan";

/**
 * Deletes lessons for good: on the server (photo, narration, lesson) and
 * from the history on this device. A lesson whose server delete fails stays
 * in the list, so the student can try again; the caller reports it.
 */
export function useDeleteLesson() {
  const queryClient = useQueryClient();

  const forgetLocally = async (ids: string[]) => {
    for (const id of ids) {
      lessonPoller.unwatch(id);
      queryClient.removeQueries({ queryKey: lessonQueryKey(id) });
    }
    await updateHistory((history) =>
      ids.reduce((h, id) => withoutEntry(h, id), history),
    );
  };

  return {
    /** Throws (friendly-mappable) when the server delete failed; the entry is kept. */
    deleteLesson: async (entry: LessonHistoryEntry) => {
      if (needsServerDelete(entry)) await deleteOnServer(entry.id);
      await forgetLocally([entry.id]);
    },
    /** Deletes every lesson in the history; resolves to how many could not be deleted. */
    clearAll: async (): Promise<number> => {
      const entries = await readHistory();
      const results = await Promise.all(
        entries.map(async (entry) => {
          try {
            if (needsServerDelete(entry)) await deleteOnServer(entry.id);
            return { id: entry.id, ok: true };
          } catch {
            return { id: entry.id, ok: false };
          }
        }),
      );
      const { removed, failed } = splitResults(results);
      await forgetLocally(removed);
      return failed.length;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function deleteOnServer(id: string): Promise<void> {
  try {
    await requestJson(`/api/lessons/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (error) {
    // Already gone on the server: nothing left to delete.
    if (error instanceof RequestError && error.status === 404) return;
    throw error;
  }
}
