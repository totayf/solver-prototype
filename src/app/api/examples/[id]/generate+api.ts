import {
  catalogForApp,
  questionImage,
  setExampleLesson,
} from "@/entities/example/server";
import { createLesson, LessonError } from "@/features/create-lesson/server";

/**
 * POST { model } → generates this example's lesson with that model and
 * records it in the catalog. Runs to completion (1–2 min); a second request
 * for the same question and model joins the running one.
 */
export async function POST(request: Request, { id }: { id: string }) {
  const body = (await request.json().catch(() => null)) as {
    model?: unknown;
  } | null;
  const model = body?.model;
  if (
    model !== "argon" &&
    model !== "opus" &&
    model !== "sonnet" &&
    model !== "sol"
  ) {
    return Response.json(
      { error: "model must be argon, opus, sonnet or sol" },
      { status: 400 },
    );
  }
  const image = await questionImage(id);
  if (!image) return Response.json({ error: "not found" }, { status: 404 });

  const key = `${id}:${model}`;
  let job = running.get(key);
  if (!job) {
    job = createLesson({
      image: image.bytes,
      mediaType: image.mediaType,
      model,
    })
      .then((lesson) => setExampleLesson(id, model, lesson.id))
      .finally(() => running.delete(key));
    running.set(key, job);
  }

  try {
    await job;
    const { questions } = await catalogForApp();
    return Response.json(questions.find((q) => q.id === id));
  } catch (error) {
    console.error(`[api/examples/${id}/generate] ${model} failed`, error);
    const message =
      error instanceof LessonError
        ? error.message
        : "Ders oluşturulamadı, tekrar dene.";
    return Response.json({ error: message }, { status: 500 });
  }
}

const running = new Map<string, Promise<unknown>>();
