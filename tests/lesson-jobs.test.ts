import { expect, mock, test } from "bun:test";

let made = 0;
let failNext = false;
const stored = new Map<string, unknown>();
mock.module(
  "../src/features/create-lesson/server/create-lesson.service",
  () => ({
    newLessonId: () => `l${++made}`,
    getLesson: async (id: string) => stored.get(id),
    LessonError: class LessonError extends Error {},
    createLesson: async ({
      id,
      onStage,
    }: {
      id: string;
      onStage: (s: string) => void;
    }) => {
      onStage("solving");
      await Bun.sleep(20);
      if (failNext) {
        failNext = false;
        throw new Error("model down");
      }
      const lesson = { id };
      stored.set(id, lesson);
      return lesson;
    },
  }),
);

const { startLessonJob, lessonJob } = await import(
  "../src/features/create-lesson/server/lesson-jobs"
);
const img = (s: string) => new TextEncoder().encode(s);

test("same photo while running joins the job", async () => {
  const a = await startLessonJob({ image: img("p1"), mediaType: "image/jpeg" });
  const b = await startLessonJob({ image: img("p1"), mediaType: "image/jpeg" });
  expect(b.id).toBe(a.id);
  expect(lessonJob(a.id)?.stage).toBe("solving");
  await a.done;
  expect(lessonJob(a.id)).toBeUndefined();
  const c = await startLessonJob({ image: img("p1"), mediaType: "image/jpeg" });
  expect(c.id).toBe(a.id); // recent finished lesson, no second generation
  expect(made).toBe(1);
});

test("deleted lesson is made again", async () => {
  const a = await startLessonJob({ image: img("p2"), mediaType: "image/jpeg" });
  await a.done;
  stored.delete(a.id);
  const b = await startLessonJob({ image: img("p2"), mediaType: "image/jpeg" });
  expect(b.id).not.toBe(a.id);
  await b.done;
});

test("failure is reported to pollers and a retry starts afresh", async () => {
  failNext = true;
  const a = await startLessonJob({ image: img("p3"), mediaType: "image/jpeg" });
  await a.done.catch(() => undefined);
  await Bun.sleep(1);
  expect(lessonJob(a.id)?.error).toBe("Ders oluşturulamadı, tekrar dene.");
  const b = await startLessonJob({ image: img("p3"), mediaType: "image/jpeg" });
  expect(b.id).not.toBe(a.id);
  await b.done;
});

test("a different pinned model is a different job", async () => {
  const a = await startLessonJob({ image: img("p4"), mediaType: "image/jpeg" });
  const b = await startLessonJob({
    image: img("p4"),
    mediaType: "image/jpeg",
    model: "opus" as never,
  });
  expect(b.id).not.toBe(a.id);
  await Promise.all([a.done, b.done]);
});
