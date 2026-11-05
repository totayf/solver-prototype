import type {
  FigurePart,
  FocusAction,
  LessonAction,
  PenColor,
  Rect,
  RevealAnswerAction,
  SpokenWord,
} from "@/entities/lesson";

import type { ScriptAction } from "../ai/lesson-script.schema";
import type { Solution } from "../ai/solution.schema";
import { findSpokenTime } from "./find-spoken-time";
import type { Locator } from "./locate";
import { actionKey } from "./validate-script";

/**
 * Converts the teacher's script actions for one step into player actions:
 * ids become rectangles, `at` quotes become absolute times, draws become the
 * rendered figure parts. Actions that can't be placed are dropped (and
 * reported) instead of drawn wrong.
 */
export function resolveActions({
  actions,
  stepIndex,
  words,
  stepStartMs,
  stepEndMs,
  context,
  onSkip,
}: {
  actions: ScriptAction[];
  stepIndex: number;
  words: SpokenWord[];
  stepStartMs: number;
  /** When this step's narration ends — temporary marks fade from here. */
  stepEndMs: number;
  context: ResolveContext;
  onSkip: (action: ScriptAction, reason: string) => void;
}): LessonAction[] {
  const resolved: LessonAction[] = [];

  actions.forEach((action, i) => {
    const atMs = findSpokenTime(action.at, words) ?? stepStartMs;
    const key = actionKey(stepIndex, i);
    const next = resolveOne(action, atMs, key, context);
    if (typeof next === "string") onSkip(action, next);
    else resolved.push(withEnd(next, action, stepEndMs));
  });

  return resolved.sort((a, b) => a.atMs - b.atMs);
}

/** Everything resolved once per lesson that single actions look up. */
export interface ResolveContext {
  locator: Locator;
  figureParts: Map<string, FigurePart[]>;
  regions: Record<string, Rect>;
  solution: Pick<Solution, "format" | "answer">;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The resolved action, or a reason string when it can't be placed. */
function resolveOne(
  action: ScriptAction,
  atMs: number,
  key: string,
  { locator, figureParts, regions, solution }: ResolveContext,
): LessonAction | string {
  switch (action.type) {
    case "highlight":
    case "underline":
    case "circle":
    case "box":
    case "strike": {
      const rects = locator.lineRects(action.targets);
      if (rects.length === 0) return "unknown target ids";
      return { type: action.type, atMs, color: pen(action.color), rects };
    }

    case "region": {
      const rect = regions[action.describe];
      if (!rect) return `region not found: ${action.describe}`;
      return {
        type: action.style,
        atMs,
        color: pen(action.color),
        rects: [rect],
      };
    }

    case "draw": {
      const parts = figureParts.get(key);
      if (!parts) return `figure "${action.figure}" could not be drawn`;
      return { type: "figure", atMs, figure: action.figure, parts };
    }

    case "focus":
      return { type: "focus", atMs, rects: locator.lineRects(action.targets) };

    case "arrow": {
      const from = locator.unionRect(action.from);
      const to = locator.unionRect(action.to);
      if (!from || !to) return "unknown arrow ids";
      return { type: "arrow", atMs, color: pen(action.color), from, to };
    }

    case "write": {
      const anchor =
        action.place === "question" && action.anchor
          ? locator.unionRect([action.anchor])
          : null;
      // A note whose anchor can't be found still belongs on screen: use the board.
      if (!anchor) {
        return {
          type: "write",
          atMs,
          color: pen(action.color),
          text: action.text,
          place: "board",
        };
      }
      return {
        type: "write",
        atMs,
        color: pen(action.color),
        text: action.text,
        place: "question",
        anchor,
        side: action.side ?? "auto",
      };
    }

    case "reveal_answer": {
      // Open and proof questions have no option to box: the stamp carries the result.
      if (!action.option) {
        return {
          type: "reveal_answer",
          atMs,
          format: solution.format,
          answer: solution.answer,
          rects: [],
        };
      }
      const rects = locator.optionRects(action.option);
      if (rects.length === 0) return `option ${action.option} not found`;
      return {
        type: "reveal_answer",
        atMs,
        format: "choice",
        answer: action.option,
        rects,
      };
    }
  }
}

/**
 * Temporary drawings fade when the step's narration ends, but stay at least
 * MIN_TEMPORARY_MS so a mark made on the last words is still seen.
 */
function withEnd(
  resolved: LessonAction,
  action: ScriptAction,
  stepEndMs: number,
): LessonAction {
  const temporary = "temporary" in action && action.temporary;
  if (!temporary || !fades(resolved)) return resolved;
  return {
    ...resolved,
    endMs: Math.max(stepEndMs, resolved.atMs + MIN_TEMPORARY_MS),
  };
}

/** Every drawing can fade; focus is a camera move and the answer always stays. */
function fades(
  action: LessonAction,
): action is Exclude<LessonAction, FocusAction | RevealAnswerAction> {
  return action.type !== "focus" && action.type !== "reveal_answer";
}

const MIN_TEMPORARY_MS = 1500;

/** The model leaves the color null for the default red pen. */
function pen(color: PenColor | null): PenColor {
  return color ?? "red";
}
