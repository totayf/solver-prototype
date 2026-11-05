// Usage: bun scripts/generate-examples.ts [argon|opus|sonnet|sol] [--only id,id]
// Generates the missing example lessons for one model (default Argon), three
// at a time, records them in the catalog and reports each answer against the key,
// with token usage and an approximate cost (list prices below, USD per 1M tokens).
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  questionImage,
  readCatalog,
  setExampleLesson,
} from "@/entities/example/server";
import {
  createLesson,
  type LessonStats,
  type UsageStage,
} from "@/features/create-lesson/server";

/** Approximate list prices, USD per 1M tokens [input, output] (Oct 2026). */
const PRICES: Record<string, [number, number]> = {
  argon: [2, 10],
  opus: [4, 20],
  sonnet: [2, 10],
  sol: [2, 10],
  regions: [0.5, 3], // Gemini 3.8 Flash
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { only: { type: "string" }, force: { type: "boolean" } },
});
const model = (positionals[0] ?? "argon") as
  | "argon"
  | "opus"
  | "sonnet"
  | "sol";
const only = values.only?.split(",");
const answers = new Map(
  (
    JSON.parse(await readFile("scripts/examples.json", "utf8")) as Array<{
      id: string;
      answer: string;
    }>
  ).map((q) => [q.id, q.answer]),
);

const todo = (await readCatalog()).filter(
  (q) => (values.force || !q.lessons[model]) && (!only || only.includes(q.id)),
);
console.log(`${model}: ${todo.length} lesson(s) to generate`);

/** Option letters are checked; open and proof answers need a human read ("chk"). */
function verdict(answer: string, expected: string | undefined): string {
  if (!expected || !/^[A-E]$/.test(expected)) return "chk";
  return answer === expected ? "ok" : "✗ ";
}

// One JSON line per lesson, for comparing models later.
const METRICS = `.data/bench/lessons-${model}.jsonl`;
await mkdir(".data/bench", { recursive: true });

let next = 0;
const total = { input: 0, output: 0, usd: 0 };
await Promise.all(
  Array.from({ length: Math.min(3, todo.length) }, async () => {
    while (next < todo.length) {
      const q = todo[next++];
      const started = Date.now();
      try {
        const image = await questionImage(q.id);
        if (!image) throw new Error("image missing");
        const usage = { input: 0, output: 0, usd: 0 };
        let stats: LessonStats | null = null;
        const lesson = await createLesson({
          image: image.bytes,
          mediaType: image.mediaType,
          model,
          onStats: (s) => {
            stats = s;
          },
          onUsage: (stage: UsageStage, u) => {
            const [inPrice, outPrice] =
              PRICES[stage === "regions" ? "regions" : model];
            const input = u.inputTokens ?? 0;
            const output = u.outputTokens ?? 0;
            usage.input += input;
            usage.output += output;
            usage.usd += (input * inPrice + output * outPrice) / 1e6;
          },
        });
        total.input += usage.input;
        total.output += usage.output;
        total.usd += usage.usd;
        await setExampleLesson(q.id, model, lesson.id);
        const expected = answers.get(q.id);
        await appendFile(
          METRICS,
          `${JSON.stringify({
            id: q.id,
            model,
            lessonId: lesson.id,
            answer: lesson.answer,
            expected,
            genMs: Date.now() - started,
            audioMs: lesson.audio.durationMs,
            steps: lesson.steps.length,
            tools: lesson.tools,
            figures: lesson.figures.length,
            ...usage,
            ...((stats as LessonStats | null) ?? {}),
          })}\n`,
        );
        const kinds = [
          ...new Set(lesson.steps.flatMap((s) => s.actions.map((a) => a.type))),
        ].join(",");
        console.log(
          `${verdict(lesson.answer, expected)} ${q.id} ${lesson.answer}/${expected} ${Math.round((Date.now() - started) / 1000)}s · ${Math.round(lesson.audio.durationMs / 1000)}s audio · tools ${lesson.tools.join(",") || "-"} · ${kinds} · ${Math.round(usage.input / 1000)}k in / ${Math.round(usage.output / 1000)}k out ≈ $${usage.usd.toFixed(2)}`,
        );
      } catch (error) {
        console.log(
          `ERR ${q.id}: ${error instanceof Error ? error.message.slice(0, 200) : error}`,
        );
      }
    }
  }),
);
console.log(
  `total: ${Math.round(total.input / 1000)}k in / ${Math.round(total.output / 1000)}k out ≈ $${total.usd.toFixed(2)} (model tokens only; OCR and speech not included)`,
);
