import type { Lesson, LessonAction, Rect } from "@/entities/lesson";

/** Every action of the lesson in time order, with a stable key for rendering. */
export function flattenActions(lesson: Lesson): TimedAction[] {
  return lesson.steps
    .flatMap((step, stepIndex) =>
      step.actions.map((action, i) => ({
        key: `${stepIndex}-${i}`,
        stepIndex,
        action,
      })),
    )
    .sort((a, b) => a.action.atMs - b.action.atMs);
}

/**
 * What the pen has drawn by `ms`. Focus is not a drawing, so only the latest
 * one counts (it's the current zoom); everything else accumulates, except
 * temporary marks once they have faded out.
 */
export function sceneAt(actions: TimedAction[], ms: number): Scene {
  const drawn: TimedAction[] = [];
  let focus: TimedAction | null = null;
  for (const item of actions) {
    if (item.action.atMs > ms) break;
    if (item.action.type === "focus") focus = item;
    else if (fadeOf(item.action, ms) > 0) drawn.push(item);
  }
  return {
    drawn,
    focus:
      focus?.action.type === "focus" && focus.action.rects.length > 0
        ? focus.action.rects
        : null,
    latest: drawn.at(-1) ?? null,
  };
}

/** 1 while a drawing is fully visible, falling to 0 as a temporary mark fades. */
export function fadeOf(action: LessonAction, ms: number): number {
  if (!("endMs" in action) || action.endMs === undefined) return 1;
  return Math.min(1, Math.max(0, 1 - (ms - action.endMs) / FADE_MS));
}

const FADE_MS = 400;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimedAction {
  key: string;
  stepIndex: number;
  action: LessonAction;
}

export interface Scene {
  drawn: TimedAction[];
  /** Region the camera is zoomed into, or null for the whole question. */
  focus: Rect[] | null;
  /** The most recent drawing — where the pen currently is. */
  latest: TimedAction | null;
}
