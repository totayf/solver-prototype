import type { LessonAction } from "@/entities/lesson";

import { type SketchPath, seedFor, sketchAction } from "./sketch";

/**
 * How one action is drawn over time. The pen first lifts and glides to the
 * start (LIFT_MS), then draws at a constant speed, so a long underline takes
 * longer than a small circle. Everything is a pure function of the lesson
 * clock: pausing freezes the pen, 1.5× speeds it up, seeking just works.
 *
 * Plans are measured once and cached per lesson and action; what a frame
 * needs (cumulative stroke lengths, where the pen touches down and rests) is
 * precomputed, so a frame only measures the one stroke being drawn.
 */
export function inkPlan(
  lessonId: string,
  key: string,
  action: LessonAction,
): InkPlan {
  if (cachedLesson !== lessonId) {
    plans.clear();
    cachedLesson = lessonId;
  }
  let plan = plans.get(key);
  if (!plan) {
    plan = buildInkPlan(key, action);
    plans.set(key, plan);
  }
  return plan;
}

/** The uncached plan; `measure` is injectable for tests (default: an SVG path element). */
export function buildInkPlan(
  key: string,
  action: LessonAction,
  measure: PathMeasure = domMeasure,
): InkPlan {
  const strokes = sketchAction(action, seedFor(key)).map((path) => ({
    ...path,
    length: measure.length(path.d),
  }));
  const before: number[] = [];
  let totalLength = 0;
  for (const stroke of strokes) {
    before.push(totalLength);
    totalLength += stroke.length;
  }
  const durationMs = drawDurationMs(action, totalLength);
  const startMs = action.atMs + LIFT_MS;
  const first = strokes[0];
  const last = strokes.at(-1);

  return {
    strokes,
    before,
    totalLength,
    startMs,
    endMs: startMs + durationMs,
    start: first ? measure.pointAt(first.d, 0) : null,
    rest: last ? measure.pointAt(last.d, 1) : null,
  };
}

/** 0 before the pen touches down, 1 once the drawing is complete. */
export function inkProgress(plan: InkPlan, timeMs: number): number {
  return clamp((timeMs - plan.startMs) / (plan.endMs - plan.startMs), 0, 1);
}

/** Progress of stroke `index`; strokes are drawn one after another. */
export function strokeProgress(
  plan: InkPlan,
  progress: number,
  index: number,
): number {
  if (plan.totalLength === 0) return progress;
  const own = plan.strokes[index]?.length ?? 0;
  if (own === 0)
    return progress * plan.totalLength >= plan.before[index] ? 1 : 0;
  return clamp((progress * plan.totalLength - plan.before[index]) / own, 0, 1);
}

/**
 * The stroke the pen is on at `progress`: every stroke before `index` is
 * complete, `drawn` is how far this one has got. `index === strokes.length`
 * once everything is drawn. Binary search over the cumulative lengths.
 */
export function activeStroke(
  plan: InkPlan,
  progress: number,
): { index: number; drawn: number } {
  const count = plan.strokes.length;
  if (progress >= 1 || count === 0) return { index: count, drawn: 1 };
  if (plan.totalLength === 0) return { index: 0, drawn: progress };
  const along = progress * plan.totalLength;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (plan.before[mid] <= along) lo = mid;
    else hi = mid - 1;
  }
  return { index: lo, drawn: strokeProgress(plan, progress, lo) };
}

/**
 * Where the pen tip is at `timeMs` (image pixels / figure units), or null
 * when it has been resting long enough to put away. `previous` is the plan
 * drawn before this one — the pen glides from its rest point to this plan's
 * start while lifting.
 */
export function penTip(
  plan: InkPlan,
  previous: InkPlan | null,
  fallback: Point | null,
  timeMs: number,
  measure: PathMeasure = domMeasure,
): Point | null {
  if (timeMs - plan.endMs > PEN_REST_MS) return null;
  const start = plan.start ?? fallback;
  if (!start) return null;

  if (timeMs < plan.startMs) {
    const from = previous?.rest ?? start;
    const t = easeInOut(clamp(1 - (plan.startMs - timeMs) / LIFT_MS, 0, 1));
    return {
      x: from.x + (start.x - from.x) * t,
      y: from.y + (start.y - from.y) * t,
    };
  }

  if (plan.strokes.length === 0) return start;
  const { index, drawn } = activeStroke(plan, inkProgress(plan, timeMs));
  if (index >= plan.strokes.length) return plan.rest ?? start;
  return measure.pointAt(plan.strokes[index].d, drawn);
}

/**
 * Upper bound of how long an action keeps the screen moving after `atMs`
 * (lift, drawing, pen rest), known without measuring any path — enough to
 * tell when a frame can be skipped.
 */
export function maxInkSpanMs(action: LessonAction): number {
  const draw =
    action.type === "write"
      ? WRITE_MAX_MS
      : action.type === "figure"
        ? FIGURE_MAX_MS
        : MARK_MAX_MS;
  return LIFT_MS + draw + PEN_REST_MS;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Pen glide between drawings. */
export const LIFT_MS = 180;
/** How long the pen lingers after finishing before it's put away. */
export const PEN_REST_MS = 1400;
/** Image pixels per millisecond — a confident teacher's hand. */
const PEN_SPEED = 1.1;
/** Board figure units (1000 = board width) per millisecond. */
const FIGURE_PEN_SPEED = 2;
const WRITE_MS_PER_CHAR = 60;
const WRITE_MAX_MS = 1600;
const FIGURE_MAX_MS = 6000;
const MARK_MAX_MS = 1400;

const plans = new Map<string, InkPlan>();
let cachedLesson: string | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function drawDurationMs(action: LessonAction, totalLength: number): number {
  if (action.type === "write") {
    return clamp(action.text.length * WRITE_MS_PER_CHAR, 450, WRITE_MAX_MS);
  }
  if (action.type === "figure") {
    return clamp(totalLength / FIGURE_PEN_SPEED, 500, FIGURE_MAX_MS);
  }
  return clamp(totalLength / PEN_SPEED, 280, MARK_MAX_MS);
}

/** Measures paths with one hidden SVG path element (WebView only). */
const domMeasure: PathMeasure = {
  length: (d) => measurer(d).getTotalLength(),
  pointAt: (d, t) => {
    const path = measurer(d);
    const point = path.getPointAtLength(path.getTotalLength() * t);
    return { x: point.x, y: point.y };
  },
};

let measuringPath: SVGPathElement | null = null;

function measurer(d: string): SVGPathElement {
  if (!measuringPath) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute(
      "style",
      "position:absolute;width:0;height:0;visibility:hidden",
    );
    measuringPath = document.createElementNS(SVG_NS, "path");
    svg.append(measuringPath);
    document.body.append(svg);
  }
  if (measuringPath.getAttribute("d") !== d) measuringPath.setAttribute("d", d);
  return measuringPath;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Stroke extends SketchPath {
  length: number;
}

export interface InkPlan {
  strokes: Stroke[];
  /** Length drawn before each stroke starts (cumulative), per stroke. */
  before: number[];
  totalLength: number;
  startMs: number;
  endMs: number;
  /** Where the pen touches down, and where it rests when done (null: no strokes). */
  start: Point | null;
  rest: Point | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface PathMeasure {
  length: (d: string) => number;
  pointAt: (d: string, t: number) => Point;
}
