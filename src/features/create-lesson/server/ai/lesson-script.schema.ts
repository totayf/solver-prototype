import { z } from "zod";

import { penColor } from "../board/colors";
import { FIGURE_KINDS } from "../board/render-figures";
import { OPTION_LETTERS } from "./solution.schema";

// ── Building blocks ──────────────────────────────────────────────────────────

const wordIds = z
  .array(z.string())
  .min(1)
  .describe(
    'OCR word ids from the list, e.g. ["w72","w73","w74"]. For a phrase, give every id of the span in reading order.',
  );

const at = z
  .string()
  .describe(
    "1-3 words copied verbatim from THIS step's narration. The action starts the moment the teacher says them.",
  );

const temporary = z
  .boolean()
  .describe(
    "true = fades when this step ends; false = stays for the rest of the lesson.",
  );

const color = penColor
  .nullable()
  .describe(
    "Pen color; null = red. Other colors only to match related things (an option with its sentence, I-V with options) or to tell items apart.",
  );

export const NOTE_SIDES = [
  "auto",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

// ── Actions (the teacher's tools) ────────────────────────────────────────────

const markAction = z.object({
  type: z
    .enum(["highlight", "underline", "circle", "box", "strike"])
    .describe(
      "highlight (always yellow): a clause or phrase. underline: a few decisive words. circle: a single token, number or label. box: a value or expression. strike: an eliminated option.",
    ),
  targets: wordIds,
  color,
  temporary,
  at,
});

const focusAction = z.object({
  type: z.literal("focus"),
  targets: z
    .array(z.string())
    .describe(
      "Word ids to zoom into; an empty list zooms back out to the whole question.",
    ),
  at,
});

const arrowAction = z.object({
  type: z.literal("arrow"),
  from: wordIds,
  to: wordIds,
  color,
  temporary,
  at,
});

const writeAction = z.object({
  type: z.literal("write"),
  text: z
    .string()
    .describe(
      "Very short handwritten note (max ~25 characters). Math in Unicode (x², √3, ½, ·, ≤, π); $…$ LaTeX only for a real fraction or a root over an expression.",
    ),
  place: z
    .enum(["question", "board"])
    .describe(
      "question: a tiny note next to a word on the photo. board: a side board, only for calculations or summaries that need room.",
    ),
  anchor: z
    .string()
    .nullable()
    .describe(
      "place=question: id of the word the note sits next to. place=board: null.",
    ),
  side: z
    .enum(NOTE_SIDES)
    .nullable()
    .describe(
      "place=question: where around the anchor ('auto' = nearest free space). place=board: null.",
    ),
  color,
  temporary,
  at,
});

const drawAction = z.object({
  type: z.literal("draw"),
  figure: z
    .string()
    .describe(
      "Board figure id, e.g. 'triangle'. Reuse it in later steps to keep adding to the same figure; a new id starts a new figure below.",
    ),
  kind: z.enum(FIGURE_KINDS),
  spec: z
    .string()
    .describe("JSON object for this kind, as in the BOARD guide."),
  temporary,
  at,
});

const regionAction = z.object({
  type: z.literal("region"),
  describe: z
    .string()
    .describe(
      "A part of a drawing/chart/map in the photo that has no OCR word, described precisely in English, e.g. 'the shaded triangle in the figure', 'the 2019 bar in the chart'.",
    ),
  style: z.enum(["circle", "box", "highlight"]),
  color,
  temporary,
  at,
});

const revealAnswerAction = z.object({
  type: z.literal("reveal_answer"),
  option: z
    .enum(OPTION_LETTERS)
    .nullable()
    .describe(
      "The correct option's letter; null when the question has no options (open or proof).",
    ),
  at,
});

// ── Script ───────────────────────────────────────────────────────────────────

export const lessonScriptSchema = z.object({
  showsCodeCheck: z
    .boolean()
    .describe(
      "true when a step shows one of the solver's program checks on the board.",
    ),
  title: z
    .string()
    .describe(
      'Subject and topic as "Ders / Konu" with the usual YKS topic name, e.g. "Türkçe / Sözcükte Anlam", "Matematik / Türev", "Fizik / Kuvvet ve Denge".',
    ),
  steps: z
    .array(
      z.object({
        narration: z
          .string()
          .describe(
            "What the teacher says in this step: 1-3 short spoken Turkish sentences, no symbols or markdown.",
          ),
        actions: z
          .array(
            z.union([
              markAction,
              focusAction,
              arrowAction,
              writeAction,
              drawAction,
              regionAction,
              revealAnswerAction,
            ]),
          )
          .max(5),
        pauseAfterMs: z
          .number()
          .int()
          .min(0)
          .max(1500)
          .describe(
            "Silence after this step: 300-800 normally, up to 1500 after the reveal.",
          ),
      }),
    )
    .min(3)
    .max(12),
});

export type LessonScript = z.infer<typeof lessonScriptSchema>;
export type ScriptStep = LessonScript["steps"][number];
export type ScriptAction = ScriptStep["actions"][number];
export type DrawScriptAction = Extract<ScriptAction, { type: "draw" }>;
export type RegionScriptAction = Extract<ScriptAction, { type: "region" }>;
