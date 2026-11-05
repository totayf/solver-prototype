// Usage: bun --env-file=.env.local scripts/bench-olympiad-2.ts <dir>
// Second-stage (open-ended) benchmark: each model solves every problem from
// the question-sheet photos (no tools, medium reasoning); then Claude Opus 5.5
// grades each solution 0–7 against the official solution pages.
// <dir> holds q/p0.png, q/p1.png (problems 1–3, 4–6) and sol/p*.png;
// solutions and grades go to <dir>/answers/ and <dir>/results.json.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";

const dir = process.argv[2];
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODELS: Array<{
  name: string;
  model: LanguageModel;
  options: Record<string, Record<string, unknown>>;
}> = [
  {
    name: "Claude Opus 5.5",
    model: anthropic("claude-opus-5-5"),
    options: { anthropic: { effort: "medium" } },
  },
  {
    name: "Claude Sonnet 5.5",
    model: anthropic("claude-sonnet-5-5"),
    options: { anthropic: { effort: "medium" } },
  },
  {
    name: "Gemini 4 Argon",
    model: google("gemini-4-argon"),
    options: { google: { thinkingConfig: { thinkingLevel: "medium" } } },
  },
  {
    name: "Gemini 3.8 Flash",
    model: google("gemini-3.8-flash"),
    options: { google: { thinkingConfig: { thinkingLevel: "medium" } } },
  },
  {
    name: "GPT-6.1 Sol",
    model: openai("gpt-6.1-sol"),
    options: { openai: { reasoningEffort: "medium" } },
  },
  {
    name: "GPT-6 Astra",
    model: openai("gpt-6-astra"),
    options: { openai: { reasoningEffort: "medium" } },
  },
];

const PROBLEMS = [1, 2, 3, 4, 5, 6];
const sheet = async (n: number) =>
  new Uint8Array(
    await readFile(path.join(dir, "q", n <= 3 ? "p0.png" : "p1.png")),
  );
const solutionPages = await Promise.all(
  (await readdir(path.join(dir, "sol")))
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map(async (f) => new Uint8Array(await readFile(path.join(dir, "sol", f)))),
);

const gradeSchema = z.object({
  score: z.number().int().min(0).max(7),
  finalAnswerCorrect: z
    .boolean()
    .nullable()
    .describe(
      "For 'find' problems: is the final answer exactly right and complete? null for proofs.",
    ),
  comment: z
    .string()
    .describe(
      "One or two sentences in Turkish: the main gap or why full marks.",
    ),
});

interface Result {
  model: string;
  n: number;
  ms: number;
  outputTokens: number;
  score: number | null;
  finalAnswerCorrect: boolean | null;
  comment: string;
}
const results: Result[] = [];
await mkdir(path.join(dir, "answers"), { recursive: true });
const save = () =>
  writeFile(path.join(dir, "results.json"), JSON.stringify(results, null, 2));

async function grade(n: number, solution: string) {
  const { object } = await generateObject({
    model: anthropic("claude-opus-5-5"),
    providerOptions: { anthropic: { effort: "high" } },
    schema: gradeSchema,
    maxRetries: 3,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: await sheet(n), mediaType: "image/png" },
          ...solutionPages.map((image) => ({
            type: "image" as const,
            image,
            mediaType: "image/png",
          })),
          {
            type: "text",
            text: `You are grading Problem ${n} of the Turkish National Math Olympiad (2nd stage, 2025) like an olympiad jury, out of 7. The first image is the problem sheet; the next images are the official solutions. Grade the candidate's solution below strictly: full marks only for a complete, correct argument (for "find all" problems, the right answer AND a proof that nothing else works); partial credit per standard olympiad practice; a right final answer with no justification gets at most 1–2.\n\nCandidate solution:\n${solution}`,
          },
        ],
      },
    ],
  });
  return object;
}

await Promise.all(
  MODELS.map(async (m) => {
    await Promise.all(
      PROBLEMS.map(async (n) => {
        const started = Date.now();
        let text = "";
        let outputTokens = 0;
        try {
          const res = await generateText({
            model: m.model,
            providerOptions: m.options as never,
            maxRetries: 3,
            maxOutputTokens: 64_000,
            abortSignal: AbortSignal.timeout(1_200_000),
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    image: await sheet(n),
                    mediaType: "image/png",
                  },
                  {
                    type: "text",
                    text: `Bu sayfa TÜBİTAK Ulusal Matematik Olimpiyatı ikinci aşama sınavından. Yalnızca ${n}. problemi çöz. Tam ve titiz bir çözüm yaz (ispat isteniyorsa eksiksiz ispat; "bulunuz" ise cevabı ve başka çözüm olmadığının ispatını ver). Bulunuz sorularında son satıra "CEVAP: ..." yaz.`,
                  },
                ],
              },
            ],
          });
          text = res.text;
          outputTokens = res.usage.outputTokens ?? 0;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message.slice(0, 160)
              : String(error);
          results.push({
            model: m.name,
            n,
            ms: Date.now() - started,
            outputTokens,
            score: null,
            finalAnswerCorrect: null,
            comment: `ERR ${message}`,
          });
          console.log(`ERR ${m.name} #${n}: ${message}`);
          await save();
          return;
        }
        const ms = Date.now() - started;
        await writeFile(
          path.join(dir, "answers", `${m.name.replaceAll(" ", "_")}-${n}.md`),
          text,
        );
        try {
          const g = await grade(n, text);
          results.push({ model: m.name, n, ms, outputTokens, ...g });
          console.log(
            `${g.score}/7 ${m.name} #${n} ${Math.round(ms / 1000)}s · ${g.comment.slice(0, 90)}`,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message.slice(0, 160)
              : String(error);
          results.push({
            model: m.name,
            n,
            ms,
            outputTokens,
            score: null,
            finalAnswerCorrect: null,
            comment: `GRADE ERR ${message}`,
          });
          console.log(`ERR grade ${m.name} #${n}: ${message}`);
        }
        await save();
      }),
    );
    console.log(`DONE ${m.name}`);
  }),
);
console.log("ALL DONE");
