import type { LessonAction } from "@/entities/lesson";

import { type SketchPath, seedFor, sketchAction } from "./sketch";

/**
 * How one action is drawn over time. The pen first lifts and glides to the
 * start (LIFT_MS), then draws at a constant speed, so a long underline takes
 * longer than a small circle. Everything is a pure function of the lesson
 * clock: pausing freezes the pen, 1.5× speeds it up, seeking just works.
 */
export function inkPlan(key: string, action: LessonAction): InkPlan {
  const cached = plans.get(key);
  if (cached) return cached;

  const strokes = sketchAction(action, seedFor(key)).map((path) => ({
    ...path,
    length: pathLength(path.d),
  }));
  const totalLength = strokes.reduce((sum, s) => sum + s.length, 0);
  const durationMs =
    action.type === "write"
      ? clamp(action.text.length * WRITE_MS_PER_CHAR, 450, 1600)
      : action.type === "figure"
        ? clamp(totalLength / FIGURE_PEN_SPEED, 500, 6000)
        : clamp(totalLength / PEN_SPEED, 280, 1400);
  const startMs = action.atMs + LIFT_MS;

  const plan = { strokes, totalLength, startMs, endMs: startMs + durationMs };
  plans.set(key, plan);
  return plan;
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
  const before = plan.strokes
    .slice(0, index)
    .reduce((sum, s) => sum + s.length, 0);
  const own = plan.strokes[index].length;
  return clamp((progress * plan.totalLength - before) / own, 0, 1);
}

/**
 * Where the pen tip is at `timeMs` (image pixels), or null when it has been
 * resting long enough to put away. `previous` is the plan drawn before this
 * one — the pen glides from its end to this plan's start while lifting.
 */
export function penTip(
  plan: InkPlan,
  previous: InkPlan | null,
  fallback: Point | null,
  timeMs: number,
): Point | null {
  if (timeMs - plan.endMs > PEN_REST_MS) return null;
  const start =
    plan.strokes.length > 0 ? pointOnPath(plan.strokes[0].d, 0) : fallback;
  if (!start) return null;

  if (timeMs < plan.startMs) {
    const from = (previous && restPoint(previous)) ?? start;
    const t = easeInOut(clamp(1 - (plan.startMs - timeMs) / LIFT_MS, 0, 1));
    return {
      x: from.x + (start.x - from.x) * t,
      y: from.y + (start.y - from.y) * t,
    };
  }

  const progress = inkProgress(plan, timeMs);
  if (plan.strokes.length === 0) return start;
  const index = plan.strokes.findIndex(
    (_, i) => strokeProgress(plan, progress, i) < 1,
  );
  if (index === -1) return restPoint(plan) ?? start;
  return pointOnPath(
    plan.strokes[index].d,
    strokeProgress(plan, progress, index),
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Pen glide between drawings. */
export const LIFT_MS = 180;
/** Image pixels per millisecond — a confident teacher's hand. */
const PEN_SPEED = 1.1;
/** Board figure units (1000 = board width) per millisecond. */
const FIGURE_PEN_SPEED = 2;
const WRITE_MS_PER_CHAR = 60;
/** How long the pen lingers after finishing before it's put away. */
const PEN_REST_MS = 1400;

const plans = new Map<string, InkPlan>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function restPoint(plan: InkPlan): Point | null {
  const last = plan.strokes.at(-1);
  return last ? pointOnPath(last.d, 1) : null;
}

/** Point at fraction `t` of an SVG path, measured with a hidden path element. */
function pointOnPath(d: string, t: number): Point {
  const path = measurer(d);
  const point = path.getPointAtLength(path.getTotalLength() * t);
  return { x: point.x, y: point.y };
}

function pathLength(d: string): number {
  return measurer(d).getTotalLength();
}

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
  totalLength: number;
  startMs: number;
  endMs: number;
}

export interface Point {
  x: number;
  y: number;
}
