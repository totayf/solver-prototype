import { z } from "zod";

export const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

export const SUBJECTS = [
  "matematik",
  "geometri",
  "fizik",
  "kimya",
  "biyoloji",
  "turkce",
  "edebiyat",
  "tarih",
  "cografya",
  "felsefe",
  "din",
  "ingilizce",
  "diger",
] as const;

export type Subject = (typeof SUBJECTS)[number];

/**
 * choice: multiple choice (A–E). open: asks for a value, set or expression,
 * with no options (olympiad second stage). proof: asks to show something.
 */
export const ANSWER_FORMATS = ["choice", "open", "proof"] as const;

export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

export const solutionSchema = z.object({
  subject: z
    .enum(SUBJECTS)
    .describe(
      "The school subject the question belongs to (geometri for geometry, including analytic geometry and solids).",
    ),
  format: z
    .enum(ANSWER_FORMATS)
    .describe(
      "choice: the question has options A–E. open: it asks for a value/set/expression and has no options. proof: it asks to show/prove something.",
    ),
  answer: z
    .string()
    .describe(
      'choice: the letter of the correct option. open: the final result, short, in Unicode math (e.g. "n = 2024", "(a, b, c) = (1, 1, 1)"). proof: the proved claim in one short Turkish sentence.',
    ),
  questionType: z
    .string()
    .describe(
      "Subject and question type in Turkish, e.g. 'Türkçe - paragrafta boşluk doldurma'.",
    ),
  reasoning: z
    .string()
    .describe(
      "Complete step-by-step solution in Turkish, as a teacher would explain it.",
    ),
  keyEvidence: z
    .array(
      z.object({
        wordIds: z
          .array(z.string())
          .min(1)
          .describe(
            "OCR ids of the decisive words, every id of the span in order.",
          ),
        why: z.string().describe("Why this part decides the answer (Turkish)."),
      }),
    )
    .describe("The parts of the question that lead to the answer."),
  options: z
    .array(
      z.object({
        letter: z.enum(OPTION_LETTERS),
        correct: z.boolean(),
        why: z
          .string()
          .describe(
            "One sentence on why this option is right or wrong (Turkish).",
          ),
      }),
    )
    .describe(
      "Every answer option, in order; empty when there are no options.",
    ),
  commonTrap: z
    .string()
    .describe(
      "The most common wrong choice or mistake and what leads to it (Turkish).",
    ),
});

export type Solution = z.infer<typeof solutionSchema>;
