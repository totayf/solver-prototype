// Usage: bun scripts/build-catalog.ts
// Builds the example catalog (.data/catalog/) from scripts/examples.json:
// copies each question photo and keeps lesson ids already generated.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readCatalog } from "@/entities/example/server";

const DIR = ".data/catalog";
const sources = JSON.parse(
  await readFile("scripts/examples.json", "utf8"),
) as Array<{
  id: string;
  exam: string;
  subject: string;
  topic: string;
  answer: string;
  file: string;
}>;

const existing = new Map((await readCatalog()).map((q) => [q.id, q]));
await mkdir(path.join(DIR, "images"), { recursive: true });

const questions = [];
for (const { file, ...q } of sources) {
  const image = `${q.id}${path.extname(file)}`;
  await copyFile(
    path.join("scripts/questions", file),
    path.join(DIR, "images", image),
  );
  questions.push({ ...q, image, lessons: existing.get(q.id)?.lessons ?? {} });
}
await writeFile(
  path.join(DIR, "catalog.json"),
  JSON.stringify({ questions }, null, 2),
);
console.log(`catalog: ${questions.length} questions`);
