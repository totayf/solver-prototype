import type { OcrResult } from "@/shared/server/ocr";

import type { LessonScript, ScriptAction } from "../ai/lesson-script.schema";
import type { Solution } from "../ai/solution.schema";
import { type DrawRequest, renderFigures } from "../board/render-figures";
import { containsQuote } from "./find-spoken-time";

/**
 * Checks a lesson script against everything the schema can't express: ids
 * exist, `at` quotes are really spoken in their step, the revealed option is
 * the solved answer, and every board figure renders. The error list goes back
 * to the model verbatim in the repair loop, so messages say how to fix.
 *
 * `blocking` is the subset the resolver can't degrade gracefully (a wrong or
 * missing answer reveal, a board figure that won't render). The rest only
 * costs one pen mark each: an unknown id drops that mark, a missing quote
 * moves it to the step start, a missing anchor moves a note to the board.
 */
export function validateScript({
  script,
  ocr,
  solution,
}: {
  script: LessonScript;
  ocr: OcrResult;
  solution: Solution;
}) {
  const ids = new Set(ocr.words.map((word) => word.id));
  const errors: string[] = [];
  const blocking: string[] = [];
  const draws: DrawRequest[] = [];
  const reveals: (string | null)[] = [];

  script.steps.forEach((step, i) => {
    step.actions.forEach((action, j) => {
      const where = actionKey(i, j);
      const unknown = citedIds(action).filter((id) => !ids.has(id));
      if (unknown.length > 0) {
        errors.push(
          `${where} (${action.type}): unknown ids ${unknown.join(", ")}; use ids from the OCR list only`,
        );
      }
      if (!containsQuote(step.narration, action.at)) {
        errors.push(
          `${where} (${action.type}): "at" = "${action.at}" is not in this step's narration; copy 1-3 consecutive words from it`,
        );
      }
      if (
        action.type === "write" &&
        action.place === "question" &&
        !action.anchor
      ) {
        errors.push(`${where} (write): place "question" needs an anchor id`);
      }
      if (action.type === "draw") {
        draws.push({
          key: where,
          figure: action.figure,
          kind: action.kind,
          spec: action.spec,
        });
      }
      if (action.type === "reveal_answer") reveals.push(action.option);
    });
  });

  const expected = solution.format === "choice" ? solution.answer : null;
  if (reveals.length !== 1) {
    blocking.push(`use reveal_answer exactly once (found ${reveals.length})`);
  } else if (reveals[0] !== expected) {
    blocking.push(
      expected
        ? `reveal_answer shows ${reveals[0]} but the verified answer is ${expected}`
        : `this ${solution.format} question has no options: reveal_answer needs option null`,
    );
  }

  const figures = renderFigures(draws);
  blocking.push(...figures.errors);
  errors.push(...blocking);
  return { errors, blocking, figures };
}

export type ScriptCheck = ReturnType<typeof validateScript>;

/** How actions are named in errors and in the rendered figure map. */
export function actionKey(step: number, action: number): string {
  return `step ${step + 1} action ${action + 1}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function citedIds(action: ScriptAction): string[] {
  switch (action.type) {
    case "highlight":
    case "underline":
    case "circle":
    case "box":
    case "strike":
    case "focus":
      return action.targets;
    case "arrow":
      return [...action.from, ...action.to];
    case "write":
      return action.place === "question" && action.anchor
        ? [action.anchor]
        : [];
    default:
      return [];
  }
}
