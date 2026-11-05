// Usage: bun --env-file=.env.local scripts/judge-lessons.ts <solutions-dir>
// Grades every lesson listed in .data/bench/lessons-*.jsonl with two judges
// (Claude Opus 5.5 and GPT-6.1 Sol): each reads the question photo and the
// lesson as a transcript (narration, marks, board writes, figures) and scores
// it 1–5 on five criteria. Second-stage olympiad lessons also get the official
// solution pages from <solutions-dir>/<booklet>/p*.png. Results are appended to
// .data/bench/judgements.jsonl (already graded pairs are skipped on re-runs).
import { appendFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import type { Lesson } from "@/entities/lesson";
import { questionImage } from "@/entities/example/server";

const solutionsDir = process.argv[2];
const OUT = ".data/bench/judgements.jsonl";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const JUDGES: Array<{
  name: string;
  model: LanguageModel;
  options: Record<string, Record<string, unknown>>;
}> = [
  {
    name: "opus",
    model: anthropic("claude-opus-5-5"),
    options: {
      anthropic: { effort: "medium", structuredOutputMode: "outputFormat" },
    },
  },
  {
    name: "sol",
    model: openai("gpt-6.1-sol"),
    options: { openai: { reasoningEffort: "medium" } },
  },
];

/** Second-stage questions → the booklet whose official solutions the judge sees. */
const OFFICIAL: Record<string, string> = {
  "olimpiyat-mat2-2024-2": "mat2-2024-cozum",
  "olimpiyat-mat2-2024-4": "mat2-2024-cozum",
  "olimpiyat-mat2-2025-2": "mat2-2025-cozum",
  "olimpiyat-fiz2-2024-1": "fiz2-2024-cozum",
  "olimpiyat-fiz2-2024-7": "fiz2-2024-cozum",
};

const score = z.number().int().min(1).max(5);
const judgement = z.object({
  correctness: score.describe(
    "Is everything the teacher says and writes mathematically/factually right, and is the final answer right (for proofs: is the proof complete and valid)? 5 = flawless.",
  ),
  clarity: score.describe(
    "Can a strong high-school student follow it the first time? Logical order, no jumps, no confusing wording.",
  ),
  focus: score.describe(
    "Follows the format: starts directly with what is asked, no filler or greeting, doesn't walk through wrong options one by one, stops at the answer. Length fits the problem.",
  ),
  visuals: score.describe(
    "Do the marks on the photo and the board (writes, figures) support what is said at that moment? 3 = neutral/adequate; 1 = misleading or missing where clearly needed.",
  ),
  teaching: score.describe(
    "Does it convey the decisive idea and why it works, so the student could solve a similar question?",
  ),
  comment: z
    .string()
    .describe(
      "One or two sentences in Turkish: the main strength and the main weakness.",
    ),
});

type Metric = {
  id: string;
  model: string;
  lessonId: string;
  expected?: string;
};
const metrics: Metric[] = (
  await Promise.all(
    (
      await readdir(".data/bench")
    )
      .filter((f) => f.startsWith("lessons-") && f.endsWith(".jsonl"))
      .map((f) => readFile(path.join(".data/bench", f), "utf8")),
  )
)
  .flatMap((text) => text.split("\n").filter(Boolean))
  .map((line) => JSON.parse(line) as Metric);

const done = new Set(
  (await readFile(OUT, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const j = JSON.parse(line) as { lessonId: string; judge: string };
      return `${j.lessonId}:${j.judge}`;
    }),
);

const jobs = metrics.flatMap((m) =>
  JUDGES.filter((j) => !done.has(`${m.lessonId}:${j.name}`)).map((j) => ({
    m,
    j,
  })),
);
console.log(`${jobs.length} judgement(s) to make`);

let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < jobs.length) {
      const { m, j } = jobs[next++];
      try {
        const lesson = JSON.parse(
          await readFile(`.data/lessons/${m.lessonId}/lesson.json`, "utf8"),
        ) as Lesson;
        const image = await questionImage(m.id);
        if (!image) throw new Error("image missing");
        const official = OFFICIAL[m.id]
          ? await Promise.all(
              (await readdir(path.join(solutionsDir, OFFICIAL[m.id])))
                .sort()
                .map((f) =>
                  readFile(path.join(solutionsDir, OFFICIAL[m.id], f)),
                ),
            )
          : [];
        const { object } = await generateObject({
          model: j.model,
          providerOptions: j.options as never,
          schema: judgement,
          maxRetries: 3,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: image.bytes,
                  mediaType: image.mediaType,
                },
                ...official.map((bytes) => ({
                  type: "image" as const,
                  image: new Uint8Array(bytes),
                  mediaType: "image/png",
                })),
                {
                  type: "text",
                  text: `You are reviewing an AI-generated video lesson for a Turkish exam question (the first image${official.length ? "; the next images are the official solutions" : ""}). In the video a teacher's voice explains while a pen marks the photo and a side board shows writing and figures. Below is the lesson as a transcript. The answer key says: ${m.expected ?? "unknown"}.\n\nScore it strictly and independently of who wrote it.\n\n${transcript(lesson)}`,
                },
              ],
            },
          ],
        });
        await appendFile(
          OUT,
          `${JSON.stringify({ id: m.id, model: m.model, lessonId: m.lessonId, judge: j.name, ...object })}\n`,
        );
        console.log(
          `${j.name} ${m.model} ${m.id}: ${object.correctness}/${object.clarity}/${object.focus}/${object.visuals}/${object.teaching}`,
        );
      } catch (error) {
        console.log(
          `ERR ${j.name} ${m.model} ${m.id}: ${error instanceof Error ? error.message.slice(0, 160) : error}`,
        );
      }
    }
  }),
);
console.log("ALL DONE");

/** The lesson as text: each step's narration and what appears with it. */
function transcript(lesson: Lesson): string {
  const kinds = new Map(lesson.figures.map((f) => [f.id, f.kind]));
  const lines = lesson.steps.map((step, i) => {
    const shown = step.actions.map((a) => {
      switch (a.type) {
        case "write":
          return `${a.place === "board" ? "board" : "note on photo"}: "${a.text}"`;
        case "figure": {
          const labels = a.parts.flatMap((p) =>
            p.kind === "text" ? [p.text] : [],
          );
          return `board figure ${a.figure} (${kinds.get(a.figure) ?? "?"})${labels.length ? ` labels: ${labels.join(", ")}` : ""}`;
        }
        case "reveal_answer":
          return `answer stamp: ${a.answer}`;
        case "focus":
          return a.rects.length ? "zoom into part of the photo" : "zoom out";
        default:
          return `${a.type} on the photo`;
      }
    });
    return `Step ${i + 1} (${Math.round(step.durationMs / 1000)}s): "${step.narration}"${shown.length ? `\n  shows: ${shown.join(" | ")}` : ""}`;
  });
  return `Lesson "${lesson.title}", ${Math.round(lesson.audio.durationMs / 1000)}s, answer given: ${lesson.answer}\n\n${lines.join("\n")}`;
}
