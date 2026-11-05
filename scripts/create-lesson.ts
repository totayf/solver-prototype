// Usage: bun scripts/create-lesson.ts scripts/questions/turkish.png
// Runs the full lesson pipeline without the app and prints what the teacher
// says and draws. Stage outputs land in .cache/lessons/<id>/.
import { readFile } from "node:fs/promises";

import { createLesson } from "@/features/create-lesson/server";
import { detectImageType } from "@/shared/server/detect-image-type";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: bun scripts/create-lesson.ts <image>");
  process.exit(1);
}

const image = new Uint8Array(await readFile(imagePath));
const mediaType = detectImageType(image);
if (!mediaType) {
  console.error("Unsupported image type");
  process.exit(1);
}

const startedAt = Date.now();
const lesson = await createLesson({ image, mediaType });

console.log(`\n${lesson.title}  (answer: ${lesson.answer}, id: ${lesson.id})`);
for (const step of lesson.steps) {
  console.log(`\n[${seconds(step.startMs)}]`);
  console.log(`  "${step.narration}"`);
  for (const action of step.actions) {
    const detail =
      action.type === "write"
        ? `"${action.text}" on ${action.place}`
        : action.type === "reveal_answer"
          ? `answer ${action.answer}`
          : "rects" in action
            ? `${action.rects.length} rect(s)`
            : "";
    console.log(`    ${seconds(action.atMs)} ${action.type} ${detail}`);
  }
}
console.log(
  `\nAudio ${seconds(lesson.audio.durationMs)} · generated in ${seconds(Date.now() - startedAt)}`,
);

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
