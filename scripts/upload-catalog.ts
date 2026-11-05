/**
 * Uploads the local example catalog (.data/catalog) and every lesson it
 * references (.data/lessons) to Kovan's Dev Solver API.
 *
 *   SOLVER_KEY=… bun scripts/upload-catalog.ts https://kovanacademy.com
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const origin = process.argv[2]?.replace(/\/$/, "");
const key = process.env.SOLVER_KEY;
if (!origin || !key) {
  console.error("Usage: SOLVER_KEY=… bun scripts/upload-catalog.ts <origin>");
  process.exit(1);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const catalog = JSON.parse(
  await readFile(path.join(DATA_DIR, "catalog", "catalog.json"), "utf8"),
) as { questions: CatalogQuestion[] };

const lessonIds = catalog.questions.flatMap((q) => Object.values(q.lessons));
console.log(
  `${catalog.questions.length} questions, ${lessonIds.length} lessons → ${origin}`,
);

let done = 0;
await mapLimit(lessonIds, 3, async (id) => {
  const dir = path.join(DATA_DIR, "lessons", id);
  const [lesson, audio, image, meta] = await Promise.all([
    readFile(path.join(dir, "lesson.json"), "utf8"),
    readFile(path.join(dir, "audio.wav")),
    readFile(path.join(dir, "image")),
    readFile(path.join(dir, "image.json"), "utf8"),
  ]);
  await send("POST", "/api/dev-solver/import", {
    lesson: JSON.parse(lesson),
    audio: audio.toString("base64"),
    image: image.toString("base64"),
    mediaType: (JSON.parse(meta) as { mediaType: string }).mediaType,
  });
  console.log(`lesson ${++done}/${lessonIds.length} ${id}`);
});

const questions = [];
for (const { image, ...question } of catalog.questions) {
  const bytes = await readFile(path.join(DATA_DIR, "catalog", "images", image));
  await send("PUT", `/api/dev-solver/examples/${question.id}/image`, bytes);
  questions.push({ ...question, tools: await defaultTools(question) });
}
await send("PUT", "/api/dev-solver/examples", { questions });
console.log(`catalog: ${questions.length} questions uploaded`);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function send(method: string, route: string, body: unknown) {
  const isBytes = body instanceof Uint8Array;
  const res = await fetch(origin + route, {
    method,
    headers: {
      "x-solver-key": key as string,
      "content-type": isBytes ? "application/octet-stream" : "application/json",
    },
    body: isBytes ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${route}: ${res.status} ${await res.text()}`);
  }
}

/** Tags come from the default (Argon) lesson, else any lesson. */
async function defaultTools(question: CatalogQuestion): Promise<string[]> {
  const id = question.lessons.argon ?? Object.values(question.lessons)[0];
  if (!id) return [];
  const file = path.join(DATA_DIR, "lessons", id, "lesson.json");
  return (JSON.parse(await readFile(file, "utf8")) as { tools?: string[] })
    .tools ?? [];
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CatalogQuestion {
  id: string;
  image: string;
  lessons: Record<string, string>;
}
