import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type Lesson,
  lessonQueryKey,
  useRememberLesson,
} from "@/entities/lesson";
import { requestJson } from "@/shared/api/request-json";

import { prepareImage } from "../lib/prepare-image";

/** Photo uri → finished lesson (cached for the lesson screen and kept in history). */
export function useCreateLesson() {
  const queryClient = useQueryClient();
  const rememberLesson = useRememberLesson();

  return useMutation({
    mutationFn: async (imageUri: string) => {
      const image = await prepareImage(imageUri);
      return requestJson<Lesson>("/api/lessons", {
        method: "POST",
        body: JSON.stringify({ image }),
      });
    },
    onSuccess: async (lesson) => {
      queryClient.setQueryData(lessonQueryKey(lesson.id), lesson);
      await rememberLesson(lesson);
    },
  });
}
