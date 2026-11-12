/**
 * Uploads the local example catalog (.data/catalog) and every lesson it
 * references (.data/lessons) to Kovan's Dev Solver API.
 *
 *   SOLVER_ADMIN_KEY=… bun scripts/upload-catalog.ts https://kovanacademy.com
 *
 * Catalog, import and image writes are admin writes: they send the admin key
 * (`SOLVER_ADMIN_KEY`, header `x-solver-admin-key`). Until the server has
 * moved them to that key, `SOLVER_KEY` (the app key, `x-solver-key`) is
 * still sent, and used alone when no admin key is set.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const origin = process.argv[2]?.replace(/\/$/, "");
const appKey = process.env.SOLVER_KEY;
const adminKey = process.env.SOLVER_ADMIN_KEY;
if (!origin || !(adminKey || appKey)) {
  console.error(
    "Usage: SOLVER_ADMIN_KEY=… [SOLVER_KEY=…] bun scripts/upload-catalog.ts <origin>",
  );
  process.exit(1);
}
const authHeaders: Record<string, string> = {
  ...(appKey ? { "x-solver-key": appKey } : {}),
  ...(adminKey ? { "x-solver-admin-key": adminKey } : {}),
};

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
  const status = await send(
    "POST",
    "/api/dev-solver/import",
    {
      lesson: JSON.parse(lesson),
      audio: audio.toString("base64"),
      image: image.toString("base64"),
      mediaType: (JSON.parse(meta) as { mediaType: string }).mediaType,
    },
    // The server refuses to overwrite a lesson: one uploaded by an earlier run is kept.
    [409],
  );
  const note = status === 409 ? " (already uploaded)" : "";
  console.log(`lesson ${++done}/${lessonIds.length} ${id}${note}`);
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

/** Sends one admin write; returns the status, throwing unless it is 2xx or `allowed`. */
async function send(
  method: string,
  route: string,
  body: unknown,
  allowed: number[] = [],
): Promise<number> {
  const isBytes = body instanceof Uint8Array;
  const res = await fetch(origin + route, {
    method,
    headers: {
      ...authHeaders,
      "content-type": isBytes ? "application/octet-stream" : "application/json",
    },
    // A Buffer is a Uint8Array; copy it into a plain ArrayBuffer-backed view for fetch.
    body: isBytes ? new Uint8Array(body) : JSON.stringify(body),
  });
  if (!res.ok && !allowed.includes(res.status)) {
    throw new Error(`${method} ${route}: ${res.status} ${await res.text()}`);
  }
  return res.status;
}

/** Tags come from the default (Argon) lesson, else any lesson. */
async function defaultTools(
  question: Pick<CatalogQuestion, "lessons">,
): Promise<string[]> {
  const id = question.lessons.argon ?? Object.values(question.lessons)[0];
  if (!id) return [];
  const file = path.join(DATA_DIR, "lessons", id, "lesson.json");
  const lesson = JSON.parse(await readFile(file, "utf8")) as {
    tools?: string[];
  };
  return lesson.tools ?? [];
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
