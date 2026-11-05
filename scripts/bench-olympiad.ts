// Usage: bun scripts/bench-olympiad.ts <dir>
// Quick benchmark: each model answers every question of a TÜBİTAK first-stage
// math booklet from the page photo (no tools), at medium reasoning effort.
// <dir> holds questions.json ([{n, page, answer}]) and pages/p<page>.png;
// results go to <dir>/results.json.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

const dir = process.argv[2];
const questions = JSON.parse(
  await readFile(path.join(dir, "questions.json"), "utf8"),
) as Array<{ n: number; page: number; answer: string }>;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const xai = createOpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const MODELS: Array<{
  name: string;
  model: LanguageModel;
  options?: Record<string, Record<string, unknown>>;
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
  {
    name: "Grok 4.7",
    model: xai.chat("grok-4.7"),
    options: { openai: { reasoningEffort: "medium" } },
  },
];

const only = process.argv[3]?.split(",");
const models = only ? MODELS.filter((m) => only.includes(m.name)) : MODELS;

const PROMPT = (n: number) =>
  `Bu sayfa TÜBİTAK lise matematik olimpiyatı birinci aşama sınavından. Yalnızca ${n}. soruyu çöz. Sonunda tek satırda "CEVAP: X" yaz (X = A, B, C, D ya da E; şıklar küçük harfle a–e yazılmış olabilir).`;

interface Result {
  model: string;
  n: number;
  expected: string;
  given: string | null;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

const results: Result[] = [];
const pageCache = new Map<number, Uint8Array>();
const page = async (p: number) => {
  if (!pageCache.has(p)) {
    pageCache.set(
      p,
      new Uint8Array(await readFile(path.join(dir, "pages", `p${p}.png`))),
    );
  }
  return pageCache.get(p) as Uint8Array;
};

// Every model runs in parallel; each one answers 4 questions at a time.
await Promise.all(
  models.map(async (m) => {
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < questions.length) {
          const q = questions[next++];
          const started = Date.now();
          try {
            const res = await generateText({
              model: m.model,
              providerOptions: m.options as never,
              maxRetries: 3,
              abortSignal: AbortSignal.timeout(900_000),
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image",
                      image: await page(q.page),
                      mediaType: "image/png",
                    },
                    { type: "text", text: PROMPT(q.n) },
                  ],
                },
              ],
            });
            const given =
              [...res.text.matchAll(/CEVAP\s*:\s*\**\s*([A-Ea-e])/g)]
                .at(-1)?.[1]
                ?.toUpperCase() ?? null;
            results.push({
              model: m.name,
              n: q.n,
              expected: q.answer,
              given,
              ms: Date.now() - started,
              inputTokens: res.usage.inputTokens ?? 0,
              outputTokens: res.usage.outputTokens ?? 0,
            });
            console.log(
              `${given === q.answer ? "✓" : "✗"} ${m.name} #${q.n} ${given ?? "?"}/${q.answer} ${Math.round((Date.now() - started) / 1000)}s`,
            );
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message.slice(0, 160)
                : String(error);
            results.push({
              model: m.name,
              n: q.n,
              expected: q.answer,
              given: null,
              ms: Date.now() - started,
              inputTokens: 0,
              outputTokens: 0,
              error: message,
            });
            console.log(`ERR ${m.name} #${q.n}: ${message}`);
          }
          await writeFile(
            path.join(dir, "results.json"),
            JSON.stringify(results, null, 2),
          );
        }
      }),
    );
    console.log(`DONE ${m.name}`);
  }),
);
console.log("ALL DONE");
