import {
  generateText,
  type LanguageModelUsage,
  type ModelMessage,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  stepCountIs,
} from "ai";

import {
  calculateTool,
  type LessonModel,
  lessonModel,
  runCodeTool,
  solveOptions,
} from "@/shared/server/ai";
import type { OcrResult } from "@/shared/server/ocr";

import { formatOcrLines } from "../lib/format-ocr-lines";
import { type Solution, solutionSchema } from "./solution.schema";

export const SOLVE_SYSTEM_PROMPT = `<role>
You are an expert solver of Turkish exam questions: YKS (TYT, AYT), LGS and science olympiad questions, including second-stage olympiad problems. You solve one question from a photo.
</role>

<inputs>
- The photo of the question: the source of truth.
- Its OCR, one visual line per row, every word tagged with an id like [w12]. Use it only to cite words; it can garble math, subscripts and figure labels.
</inputs>

<method>
- Read the whole question, figure and options before deciding anything.
- Decide its format: choice (options A–E), open (find a value, set or expression; no options) or proof (show/prove a claim).
- Solve it fully and rigorously. For choice, check the result against every option; exactly one is correct. For open, make sure the answer is complete (all solutions, and why there are no others). For proof, give a complete proof with no gaps.
- Never do arithmetic or algebra in your head: use calculate for every non-trivial step and to re-check the final value.
- When the answer depends on counting, cases or probability, or on a claim you can test on many values, verify it with run_code (a small JavaScript program that enumerates or simulates) before you commit.
</method>

<output>
- answer: for choice, the letter of the correct option, matching the one option marked correct; for open, the final result; for proof, the proved claim. options is empty unless the format is choice.
- keyEvidence: the decisive words, cited by their OCR ids (every id of the span, in order).
- All explanations in clear, natural Turkish.
</output>`;

/** A program the solver really ran in the sandbox, with what it printed. */
export interface CodeCheck {
  code: string;
  output: string;
}

/**
 * Solves the question with a calculator and a code sandbox, then checks that
 * the answer and the per-option verdicts agree; on a mismatch the model gets
 * one retry with the problem spelled out. Also returns the successful
 * run_code checks, so the teacher can show a real one (never a made-up one).
 */
export async function solveQuestion({
  image,
  mediaType,
  ocr,
  model,
  onUsage,
}: {
  image: Uint8Array;
  mediaType: string;
  ocr: OcrResult;
  /** Pins one model; the default chain otherwise. */
  model?: LessonModel;
  onUsage?: (usage: LanguageModelUsage) => void;
}): Promise<{ solution: Solution; checks: CodeCheck[] }> {
  const checks: CodeCheck[] = [];
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "image", image, mediaType },
        {
          type: "text",
          text: `OCR words by line:\n${formatOcrLines(ocr)}\n\nSolve this question.`,
        },
      ],
    },
  ];

  for (let attempt = 0; ; attempt++) {
    let result: Awaited<ReturnType<typeof solveOnce>>;
    try {
      result = await solveOnce(messages, model);
    } catch (error) {
      // A final answer that breaks the schema (or a loop that never answers): try once more.
      const malformed =
        NoObjectGeneratedError.isInstance(error) ||
        NoOutputGeneratedError.isInstance(error);
      if (!malformed || attempt === 1) throw error;
      continue;
    }
    onUsage?.(result.totalUsage);
    checks.push(...codeChecks(result.steps));

    const solution = result.output;
    const problem = inconsistency(solution);
    if (!problem || attempt === 1) return { solution, checks };
    messages.push(...result.response.messages, {
      role: "user",
      content: `${problem} Re-check the question and return the corrected solution.`,
    });
  }
}

function solveOnce(messages: ModelMessage[], model?: LessonModel) {
  return generateText({
    model: lessonModel(model),
    providerOptions: solveOptions,
    system: SOLVE_SYSTEM_PROMPT,
    messages,
    tools: { calculate: calculateTool, run_code: runCodeTool },
    output: Output.object({ schema: solutionSchema }),
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 48_000,
    maxRetries: 2,
  });
}

type SolveSteps = Awaited<ReturnType<typeof solveOnce>>["steps"];

function codeChecks(steps: SolveSteps): CodeCheck[] {
  return steps.flatMap((step) =>
    step.toolResults.flatMap((r) => {
      if (r.toolName !== "run_code" || r.dynamic) return [];
      const out = r.output as {
        output: string;
        result?: string;
        error?: string;
      };
      if (out.error) return [];
      const output = [out.output, out.result].filter(Boolean).join("\n").trim();
      return output
        ? [{ code: (r.input as { code: string }).code, output }]
        : [];
    }),
  );
}

/** Why the answer and the option verdicts disagree, or null when they agree. */
export function inconsistency(solution: Solution): string | null {
  if (solution.format !== "choice") {
    return solution.options.length > 0
      ? `A ${solution.format} question has no options, but "options" is filled; leave it empty or use format "choice".`
      : null;
  }
  const correct = solution.options.filter((option) => option.correct);
  if (correct.length !== 1) {
    return `Exactly one option must be correct, but ${correct.length} are marked correct.`;
  }
  if (correct[0].letter !== solution.answer) {
    return `"answer" is ${solution.answer} but option ${correct[0].letter} is marked correct.`;
  }
  return null;
}

const MAX_STEPS = 30;
