import { expect, mock, test } from "bun:test";

process.env.ANTHROPIC_API_KEY ||= "x";
process.env.OPENAI_API_KEY ||= "x";
process.env.GEMINI_API_KEY ||= "x";
process.env.GOOGLE_VISION_API_KEY ||= "x";

const contradicting = {
  format: "choice",
  answer: "B",
  options: [
    { letter: "A", correct: true },
    { letter: "B", correct: false },
  ],
};
let calls = 0;
mock.module("ai", () => {
  const real = require("ai");
  return {
    ...real,
    generateText: async () => {
      calls++;
      return {
        output: contradicting,
        steps: [],
        totalUsage: {},
        response: { messages: [] },
      };
    },
  };
});

const { solveQuestion } = await import(
  "../src/features/create-lesson/server/ai/solve-question.agent"
);
const { LessonError } = await import(
  "../src/features/create-lesson/server/lesson-error"
);

test("a choice answer that still contradicts itself after the retry is refused", async () => {
  const run = solveQuestion({
    image: new Uint8Array(1),
    mediaType: "image/jpeg",
    ocr: { width: 1, height: 1, words: [] } as never,
  });
  await expect(run).rejects.toBeInstanceOf(LessonError);
  await expect(run).rejects.toThrow("emin olamadım");
  expect(calls).toBe(2);
});
