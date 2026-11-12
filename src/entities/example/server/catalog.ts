import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ExampleModel, ExampleQuestion } from "../model/types";

/**
 * The example catalog: questions to try the teacher on, each with a photo and
 * the lesson ids generated so far per model. Lives in `.data/catalog/`
 * (`catalog.json` + `images/<id>.png`), next to the stored lessons.
 */
export async function readCatalog(): Promise<StoredQuestion[]> {
  try {
    const file = await readFile(CATALOG_FILE, "utf8");
    return (JSON.parse(file) as { questions: StoredQuestion[] }).questions;
  } catch {
    return [];
  }
}

/**
 * The catalog as the app sees it: image URLs instead of file names, and the
 * tools its default lesson (Argon, else any) really shows.
 */
export async function catalogForApp(): Promise<{
  questions: ExampleQuestion[];
}> {
  const questions = await readCatalog();
  return {
    questions: await Promise.all(
      questions.map(async ({ image: _image, ...q }) => ({
        ...q,
        imageUrl: `/api/examples/${q.id}/image`,
        tools: await lessonTools(
          q.lessons.argon ?? Object.values(q.lessons)[0],
        ),
      })),
    ),
  };
}

/**
 * A lesson's tool tags. Lessons never change once written, so each file is
 * parsed once per process instead of on every catalog request (a lesson JSON
 * with board figures runs to hundreds of KB).
 */
async function lessonTools(lessonId: string | undefined): Promise<string[]> {
  if (!lessonId) return [];
  const known = toolsByLesson.get(lessonId);
  if (known) return known;
  try {
    const file = await readFile(
      path.join(LESSONS_DIR, lessonId, "lesson.json"),
      "utf8",
    );
    const tools = (JSON.parse(file) as { tools?: string[] }).tools ?? [];
    toolsByLesson.set(lessonId, tools);
    return tools;
  } catch {
    return [];
  }
}

const toolsByLesson = new Map<string, string[]>();

export async function questionImage(
  id: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mediaType: string } | null> {
  const question = (await readCatalog()).find((q) => q.id === id);
  if (!question) return null;
  try {
    const bytes = new Uint8Array(
      await readFile(path.join(IMAGES_DIR, question.image)),
    );
    return {
      bytes,
      mediaType: question.image.endsWith(".png") ? "image/png" : "image/jpeg",
    };
  } catch {
    return null;
  }
}

/** Records a generated lesson; writes are serialized so parallel runs don't clobber each other. */
export function setExampleLesson(
  id: string,
  model: ExampleModel,
  lessonId: string,
): Promise<StoredQuestion | null> {
  const run = writes.then(async () => {
    const questions = await readCatalog();
    const question = questions.find((q) => q.id === id);
    if (!question) return null;
    question.lessons[model] = lessonId;
    await mkdir(path.dirname(CATALOG_FILE), { recursive: true });
    await writeFile(CATALOG_FILE, JSON.stringify({ questions }, null, 2));
    return question;
  });
  writes = run.catch(() => undefined);
  return run;
}

let writes: Promise<unknown> = Promise.resolve();

const CATALOG_DIR = path.join(process.cwd(), ".data", "catalog");
const CATALOG_FILE = path.join(CATALOG_DIR, "catalog.json");
const IMAGES_DIR = path.join(CATALOG_DIR, "images");
const LESSONS_DIR = path.join(process.cwd(), ".data", "lessons");

// ── Types ────────────────────────────────────────────────────────────────────

/** A catalog entry on disk: the photo's file name instead of a URL. */
export type StoredQuestion = Omit<ExampleQuestion, "imageUrl" | "tools"> & {
  image: string;
};
