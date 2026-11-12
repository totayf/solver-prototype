import type { Lesson, LessonAction, LessonStep, Rect } from "@/entities/lesson";

import { maxInkSpanMs } from "./ink";

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

/**
 * When the picture can change: `busy` spans where something animates every
 * frame (the pen lifting, drawing and resting; a mark fading), `marks`
 * single moments where it jumps (a zoom, a new caption or step). Between
 * them the frame is identical, so the clock can skip re-rendering.
 */
export function renderSchedule(
  actions: TimedAction[],
  extraMarks: number[] = [],
): RenderSchedule {
  const spans: Array<[number, number]> = [];
  for (const { action } of actions) {
    if (action.type !== "focus") {
      spans.push([action.atMs, action.atMs + maxInkSpanMs(action)]);
    }
    if ("endMs" in action && action.endMs !== undefined) {
      spans.push([action.endMs, action.endMs + FADE_MS]);
    }
  }
  const busy = mergeSpans(spans);
  const marks = [
    ...actions.map((item) => item.action.atMs),
    ...busy.flat(),
    ...extraMarks,
  ].sort((a, b) => a - b);
  return { busy, marks };
}

/**
 * Whether moving the clock from `prevMs` (last rendered) to `nextMs` changes
 * anything on screen: seeking back, being inside a busy span, or passing a
 * mark always does.
 */
export function needsFrame(
  schedule: RenderSchedule,
  prevMs: number,
  nextMs: number,
): boolean {
  if (nextMs < prevMs) return true;
  if (nextMs === prevMs) return false;
  if (inBusySpan(schedule.busy, nextMs)) return true;
  // Any mark in (prevMs, nextMs]?
  const i = firstIndexAbove(schedule.marks, prevMs);
  return i < schedule.marks.length && schedule.marks[i] <= nextMs;
}

/** Index of the step being narrated at `ms` (the last one that has started). */
export function stepIndexAt(steps: LessonStep[], ms: number): number {
  let lo = 0;
  let hi = steps.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid].startMs <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The step list ("Bölümler"): where each step starts and a short label from its narration. */
export function chapters(lesson: Lesson): Chapter[] {
  return lesson.steps.map((step, index) => ({
    index,
    startMs: step.startMs,
    label: shorten(step.narration, CHAPTER_LABEL_CHARS),
  }));
}

// ── Constants ────────────────────────────────────────────────────────────────

const FADE_MS = 400;
const CHAPTER_LABEL_CHARS = 64;

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function inBusySpan(busy: Array<[number, number]>, ms: number): boolean {
  let lo = 0;
  let hi = busy.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = busy[mid];
    if (ms < start) hi = mid - 1;
    else if (ms > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** First index whose value is > `value` (sorted ascending). */
function firstIndexAbove(values: number[], value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Cuts at a word boundary and adds "…" when the text is longer than `max`. */
export function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

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

export interface RenderSchedule {
  /** Merged [start, end] spans (ms) where the picture changes every frame. */
  busy: Array<[number, number]>;
  /** Sorted moments (ms) where the picture changes once. */
  marks: number[];
}

export interface Chapter {
  index: number;
  startMs: number;
  label: string;
}
