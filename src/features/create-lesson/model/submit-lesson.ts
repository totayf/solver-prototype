import {
  isPendingBody,
  rememberPendingLesson,
  rememberReadyLesson,
} from "@/entities/lesson";

import { startLesson } from "../api/start-lesson";

/**
 * Sends a prepared photo and records the lesson in the history before
 * anything else can go wrong: a 202 is saved as pending (with the photo, for
 * a retry) and polled in the background. Returns the lesson id to open.
 * `replaces` is the failed history entry a retry came from.
 */
export async function submitLesson(
  image: string,
  replaces?: string,
): Promise<string> {
  const body = await startLesson(image);
  if (isPendingBody(body)) {
    await rememberPendingLesson({
      id: body.id,
      stage: body.stage,
      image,
      replaces,
    });
    return body.id;
  }
  await rememberReadyLesson(body, replaces);
  return body.id;
}
