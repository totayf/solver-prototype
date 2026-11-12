import { useMutation } from "@tanstack/react-query";

import { type LessonHistoryEntry, readUpload } from "@/entities/lesson";
import { UserFacingError } from "@/shared/api/request-json";

import { submitLesson } from "./submit-lesson";

/**
 * "Tekrar dene" on a failed lesson: re-sends the exact photo kept for it
 * (same bytes → the server joins a job it is still running instead of
 * charging again). Resolves to the new lesson id, which replaces the failed
 * entry in the history.
 */
export function useRetryLesson() {
  return useMutation({
    mutationFn: async (entry: LessonHistoryEntry) => {
      const image =
        entry.status !== "ready" && entry.uploadUri
          ? await readUpload(entry.uploadUri)
          : null;
      if (!image) {
        throw new UserFacingError(
          "Bu sorunun fotoğrafı artık yok. Soruyu yeniden çekip gönder.",
          "image",
        );
      }
      return submitLesson(image, entry.id);
    },
  });
}
