import {
  generateObject,
  type LanguageModelUsage,
  type ModelMessage,
  NoObjectGeneratedError,
} from "ai";

import {
  type LessonModel,
  lessonModel,
  scriptOptions,
} from "@/shared/server/ai";
import type { OcrResult } from "@/shared/server/ocr";

import { boardGuideFor } from "../board/guide";
import { formatOcrLines } from "../lib/format-ocr-lines";
import { type ScriptCheck, validateScript } from "../lib/validate-script";
import { type LessonScript, lessonScriptSchema } from "./lesson-script.schema";
import type { Solution, Subject } from "./solution.schema";
import type { CodeCheck } from "./solve-question.agent";

/**
 * The teacher's instructions. Built per question so only the board figures
 * that suit its subject are described (`boardGuideFor`).
 */
export function lessonScriptPrompt(subject: Subject): string {
  return `<role>
You are a Turkish exam teacher explaining one solved question to one student. The student hears your voice while your pen marks the photo and a side board, as if you were solving it at the desk together.
</role>

<inputs>
- The photo of the question.
- Its OCR: one visual line per row (L0, L1, …), every word tagged with an id like [w12].
- A verified solution. Trust it; never re-solve the question or change the answer.
- Sometimes, programs the solver really ran to verify the answer, with their output.
</inputs>

<goal>
The student understands why the answer is right with the least effort. Explain the decisive idea clearly, show it on the photo or the board while you say it, and stop as soon as the answer is clear. Take as long as the explanation needs, and not a sentence more: no filler.
</goal>

<narration>
- Natural spoken Turkish in short sentences; no markdown, symbols or emoji (it is read aloud).
- Read math in words ("x kare", "dört bölü dokuz", "A fark C"); say options as "A şıkkı".
- Start directly with what the question asks: no greeting, no "bugün…", no outline.
- Quote only the decisive bits of a passage; never read it all.
- Split what you say into short steps only so the pen can follow your words; the student never sees the steps.
</narration>

<reaching_the_answer>
Once your reasoning reaches the answer, mark the correct option, say it, and stop: no summary, tips, trap warnings or goodbye.
Don't walk through the other options one by one; it makes the lesson long without teaching anything. Look at options only when the solving method itself is checking them (e.g. "hangisi söylenemez", choosing which sentence fits a paragraph), and then keep each one short.
For statement questions (I, II, III), judge the statements where they are written, then mark the option that lists the true ones.
The solution's "format" says what kind of question it is:
- choice: as above; reveal_answer with the option's letter.
- open (no options): build the result on the board step by step, write the final result in a box, then reveal_answer with option null. Show why nothing else works when the question asks for all solutions.
- proof: give the whole proof on the board, one idea per line, every step justified in words; end with reveal_answer with option null. Take the time a full proof needs; don't skip steps a strong student couldn't fill in.
</reaching_the_answer>

<pen_on_the_photo>
- Use only ids from the OCR list; for a phrase give every id of the span. To mark an option, include its letter id and its text ids.
- "at" is 1-3 consecutive words copied from the same step's narration: the moment the action happens.
- 1-3 actions per step. underline: a few decisive words. highlight: a clause. circle: one token, number or figure label. box: a value or expression. strike: something you rule out.
- Labels inside the photo's figures and charts (A, B, 40°, 3 cm, axis numbers) are OCR words too; mark them by id. OCR may misread a label ("|" for I, "0" for O): trust the photo and cite that id anyway.
- region: a part of a drawing with no word (a shaded area, a curve, a bar, a map area), described precisely in English. Prefer ids when a label exists.
- write place "question": a tiny note next to a word ("≠", "1. boşluk", "= 12").
- focus: zoom into a long passage while you discuss it; zoom out (empty targets) when you move on.
</pen_on_the_photo>

<keep_it_clear>
- Every drawing has "temporary": true fades it when its step ends, false keeps it. Keep only what the student still needs later, so the screen never gets cluttered.
- color null is the red pen. Use blue, green, purple or orange whenever colors make the explanation easier to follow, e.g. to tell statements or views apart or to match parts of the text with the options. highlight is always yellow.
</keep_it_clear>

<board>
The right half of the screen; items stack top to bottom.
- write place "board": a line of working. Write math in Unicode (x², √3, ½, ·, ≤, ≠, π, °); use $…$ LaTeX only for a real fraction or a root over an expression ($\\frac{x+1}{2}$).
- draw: a figure built along with the narration. Draws with the same figure id add to one figure, so the student watches it grow (the triangle, then in a later step its height). Draw what the photo doesn't already show and the student would otherwise have to picture in their head: the probability tree of a multi-stage experiment, the places a geography question names on a map, a solid's hidden diagonal or cross-section, a table or chart built from data given in words. Don't copy a photo's figure as it is; redraw it only to add helpers.
- spec is a JSON object string for the kind; texts inside use Unicode math; "color" is optional everywhere (red for marks, dark ink for outlines by default).
${boardGuideFor(subject)}
</board>

<code_checks>
When the solver's program confirms the answer in a way a student finds convincing (it counted every case, or simulated the experiment), show it in one board line and one sentence, e.g. "Bilgisayarla tek tek saydık: 132 durum ✓". Use only the given output; never claim a check that isn't listed.
</code_checks>`;
}

/**
 * Writes the lesson script, then checks it (ids, quotes, answer, figures) and
 * sends any problems back to the model — up to two repair rounds. Whatever
 * still fails afterwards is dropped by the resolver instead of drawn wrong.
 */
export async function writeLessonScript({
  image,
  mediaType,
  ocr,
  solution,
  checks = [],
  model,
  onUsage,
}: {
  image: Uint8Array;
  mediaType: string;
  ocr: OcrResult;
  solution: Solution;
  /** Programs the solver ran to verify the answer. */
  checks?: CodeCheck[];
  /** Pins one model; the default chain otherwise. */
  model?: LessonModel;
  onUsage?: (usage: LanguageModelUsage) => void;
}): Promise<{ script: LessonScript; check: ScriptCheck; repairs: number }> {
  const system = lessonScriptPrompt(solution.subject ?? "diger");
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "image", image, mediaType },
        {
          type: "text",
          text: [
            `OCR words by line:\n${formatOcrLines(ocr)}`,
            `Verified solution:\n${JSON.stringify(solution, null, 2)}`,
            ...checks
              .slice(-3)
              .map(
                (c, i) =>
                  `Solver check ${i + 1}:\n\`\`\`js\n${c.code}\n\`\`\`\nOutput:\n${c.output}`,
              ),
            "Write the lesson script.",
          ].join("\n\n"),
        },
      ],
    },
  ];

  for (let repairs = 0; ; repairs++) {
    let generated: { object: LessonScript; usage: LanguageModelUsage };
    try {
      generated = await generateObject({
        model: lessonModel(model),
        providerOptions: scriptOptions,
        schema: lessonScriptSchema,
        system,
        messages,
        maxOutputTokens: 48_000,
        maxRetries: 2,
      });
    } catch (error) {
      // Output that breaks the schema is one more thing to repair.
      if (!NoObjectGeneratedError.isInstance(error) || repairs === MAX_REPAIRS)
        throw error;
      if (error.usage) onUsage?.(error.usage);
      if (error.text) messages.push({ role: "assistant", content: error.text });
      messages.push({
        role: "user",
        content: `That response did not match the required JSON schema (${causeOf(error)}). Return the whole script again, matching the schema exactly.`,
      });
      continue;
    }
    const { object: script, usage } = generated;
    onUsage?.(usage);

    const check = validateScript({ script, ocr, solution });
    if (check.errors.length === 0 || repairs === MAX_REPAIRS) {
      return { script, check, repairs };
    }
    messages.push(
      { role: "assistant", content: JSON.stringify(script) },
      {
        role: "user",
        content: `The script has problems:\n- ${check.errors.join("\n- ")}\n\nReturn the whole script again with these fixed and everything else unchanged.`,
      },
    );
  }
}

const MAX_REPAIRS = 2;

function causeOf(error: NoObjectGeneratedError): string {
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return (cause || error.message).slice(0, 1500);
}
