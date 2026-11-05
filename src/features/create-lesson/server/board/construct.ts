import { z } from "zod";

import type { FigurePart, InkColor } from "@/entities/lesson";

import {
  arc,
  circle,
  clamp,
  dashedLine,
  FIGURE_WIDTH,
  FigureError,
  type FigureRender,
  line,
  type Pt,
  path,
  polyline,
  text,
} from "./svg";
import { inkColor } from "./colors";

/**
 * Geometry by construction: the model names points and how they relate
 * (coordinates from the problem, polar offsets, midpoints, feet, intersections);
 * this kernel computes every position, fits the figure to the board and turns
 * each step into pen strokes. Names starting with "_" are hidden helpers.
 */
export const constructSpec = z.object({
  steps: z.array(z.record(z.string(), z.unknown())).min(1),
});

export function renderConstruct(
  specs: z.infer<typeof constructSpec>[],
): FigureRender {
  const steps = specs.map((spec) => spec.steps.map(parseStep));
  const points = new Map<string, Pt>();
  const circles: Array<{ center: Pt; radius: number }> = [];

  // Pass 1 — solve every point in problem space (y up).
  for (const step of steps.flat()) {
    if (step.kind === "point") points.set(step.name, solvePoint(step, points));
    if (step.kind === "circle") {
      const center = need(points, step.center);
      const radius = step.through
        ? dist(center, need(points, step.through))
        : step.radius;
      if (!radius || radius <= 0)
        throw new FigureError(`circle ${step.center}: give radius or through`);
      circles.push({ center, radius });
    }
    for (const ref of referencedPoints(step)) need(points, ref);
  }

  // Pass 2 — fit to the board and draw.
  const view = fit([...points.values()], circles);
  const centroid = average([...points.values()].map(view.map));
  const parts = steps.map((group) =>
    group.flatMap((step) => draw(step, points, view, centroid)),
  );
  return { height: view.height, parts };
}

// ── Steps ────────────────────────────────────────────────────────────────────

function parseStep(raw: Record<string, unknown>): Step {
  const parsedColor = inkColor.optional().safeParse(raw.color);
  if (!parsedColor.success)
    throw new FigureError(
      `color must be one of ${inkColor.options.join(", ")}`,
    );
  const color = parsedColor.data;
  const refs = (key: string, min: number) => {
    const value = raw[key];
    if (
      !Array.isArray(value) ||
      value.length < min ||
      value.some((v) => typeof v !== "string")
    ) {
      throw new FigureError(
        `"${key}" must be a list of at least ${min} point names`,
      );
    }
    return value as string[];
  };
  const nums = (key: string, n: number) => {
    const value = raw[key];
    if (!Array.isArray(value) || value.length !== n)
      throw new FigureError(`"${key}" needs ${n} values`);
    return value;
  };

  if (typeof raw.point === "string") {
    const name = raw.point;
    if (raw.at) {
      const [x, y] = nums("at", 2).map(Number);
      return { kind: "point", name, rule: { at: { x, y } }, color };
    }
    if (raw.polar) {
      const [from, length, angle] = nums("polar", 3);
      return {
        kind: "point",
        name,
        rule: { polar: [String(from), Number(length), Number(angle)] },
        color,
      };
    }
    if (raw.midpoint)
      return {
        kind: "point",
        name,
        rule: { midpoint: refs("midpoint", 2) },
        color,
      };
    if (raw.foot)
      return { kind: "point", name, rule: { foot: refs("foot", 3) }, color };
    if (raw.along) {
      const [a, b, t] = nums("along", 3);
      return {
        kind: "point",
        name,
        rule: { along: [String(a), String(b), Number(t)] },
        color,
      };
    }
    if (raw.intersect) {
      const value = raw.intersect as unknown[];
      if (!Array.isArray(value) || value.length !== 2)
        throw new FigureError(`point ${name}: intersect needs two lines`);
      return {
        kind: "point",
        name,
        rule: { intersect: value as [string[], string[]] },
        color,
      };
    }
    throw new FigureError(
      `point ${name}: give at, polar, midpoint, foot, along or intersect`,
    );
  }
  if (raw.segment) {
    return {
      kind: "segment",
      ends: refs("segment", 2),
      dashed: raw.dashed === true,
      label: str(raw.label),
      color,
    };
  }
  if (raw.polygon)
    return { kind: "polygon", vertices: refs("polygon", 3), color };
  if (typeof raw.circle === "string") {
    return {
      kind: "circle",
      center: raw.circle,
      radius: Number(raw.radius) || 0,
      through: str(raw.through),
      dashed: raw.dashed === true,
      color,
    };
  }
  if (raw.angle)
    return {
      kind: "angle",
      vertices: refs("angle", 3),
      right: raw.right === true,
      label: str(raw.label),
      color,
    };
  if (raw.equal)
    return {
      kind: "equal",
      segments: raw.equal as string[][],
      ticks: Number(raw.ticks) || 1,
      color,
    };
  if (raw.parallel)
    return { kind: "parallel", segments: raw.parallel as string[][], color };
  if (raw.fill) return { kind: "fill", vertices: refs("fill", 3), color };
  if (typeof raw.label === "string" && typeof raw.text === "string") {
    return { kind: "label", name: raw.label, value: raw.text, color };
  }
  throw new FigureError(`unknown step ${JSON.stringify(raw)}`);
}

function solvePoint(step: PointStep, points: Map<string, Pt>): Pt {
  const { rule } = step;
  if ("at" in rule) return rule.at;
  if ("polar" in rule) {
    const [from, length, angle] = rule.polar;
    const o = need(points, from);
    const rad = (angle * Math.PI) / 180;
    return { x: o.x + length * Math.cos(rad), y: o.y + length * Math.sin(rad) };
  }
  if ("midpoint" in rule) {
    const [a, b] = rule.midpoint.map((n) => need(points, n));
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  if ("along" in rule) {
    const [an, bn, t] = rule.along;
    const a = need(points, an);
    const b = need(points, bn);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  if ("foot" in rule) {
    const [p, a, b] = rule.foot.map((n) => need(points, n));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  const [[a1, a2], [b1, b2]] = rule.intersect.map((pair) =>
    pair.map((n) => need(points, n)),
  );
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9)
    throw new FigureError(`point ${step.name}: the lines are parallel`);
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

function referencedPoints(step: Step): string[] {
  switch (step.kind) {
    case "segment":
      return step.ends;
    case "polygon":
    case "fill":
      return step.vertices;
    case "angle":
      return step.vertices;
    case "equal":
    case "parallel":
      return step.segments.flat();
    case "label":
      return [step.name];
    default:
      return [];
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw(
  step: Step,
  points: Map<string, Pt>,
  view: View,
  centroid: Pt,
): FigurePart[] {
  const at = (name: string) => view.map(need(points, name));

  switch (step.kind) {
    case "point": {
      if (step.name.startsWith("_")) return [];
      const p = at(step.name);
      const away = unit({ x: p.x - centroid.x, y: p.y - centroid.y });
      return [
        path(circle(p, 5), { color: step.color ?? "ink", fill: "solid" }),
        text(p.x + away.x * 34, p.y + away.y * 34 + 12, step.name, {
          color: step.color ?? "ink",
        }),
      ];
    }
    case "segment": {
      const [a, b] = step.ends.map(at);
      const parts = [
        path(step.dashed ? dashedLine(a, b) : line(a, b), {
          color: step.color ?? (step.dashed ? "red" : "ink"),
        }),
      ];
      if (step.label) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const normal = unit({ x: -(b.y - a.y), y: b.x - a.x });
        const out =
          dot(normal, { x: mid.x - centroid.x, y: mid.y - centroid.y }) >= 0
            ? 1
            : -1;
        parts.push(
          text(
            mid.x + normal.x * 30 * out,
            mid.y + normal.y * 30 * out + 10,
            step.label,
            { color: step.color ?? "red", size: 30 },
          ),
        );
      }
      return parts;
    }
    case "polygon":
      return [
        path(polyline(step.vertices.map(at), true), {
          color: step.color ?? "ink",
        }),
      ];
    case "circle": {
      const center = at(step.center);
      const radius = step.through
        ? dist(center, at(step.through))
        : step.radius * view.scale;
      return [path(circle(center, radius), { color: step.color ?? "ink" })];
    }
    case "angle": {
      const [a, b, c] = step.vertices.map(at);
      const color = step.color ?? "red";
      const ua = unit({ x: a.x - b.x, y: a.y - b.y });
      const uc = unit({ x: c.x - b.x, y: c.y - b.y });
      if (step.right) {
        const s = 26;
        const corner = {
          x: b.x + (ua.x + uc.x) * s,
          y: b.y + (ua.y + uc.y) * s,
        };
        return [
          path(
            polyline([
              { x: b.x + ua.x * s, y: b.y + ua.y * s },
              corner,
              { x: b.x + uc.x * s, y: b.y + uc.y * s },
            ]),
            { color },
          ),
        ];
      }
      const start = Math.atan2(ua.y, ua.x);
      let delta = Math.atan2(uc.y, uc.x) - start;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta <= -Math.PI) delta += 2 * Math.PI;
      const parts = [path(arc(b, 42, start, delta), { color })];
      if (step.label) {
        const mid = start + delta / 2;
        parts.push(
          text(
            b.x + Math.cos(mid) * 80,
            b.y + Math.sin(mid) * 80 + 10,
            step.label,
            { color, size: 28 },
          ),
        );
      }
      return parts;
    }
    case "equal":
      return step.segments.flatMap(([an, bn]) => {
        const [a, b] = [at(an), at(bn)];
        return [
          path(ticks(a, b, step.ticks), {
            color: step.color ?? "red",
            width: 3,
          }),
        ];
      });
    case "parallel":
      return step.segments.flatMap(([an, bn]) => {
        const [a, b] = [at(an), at(bn)];
        return [path(chevron(a, b), { color: step.color ?? "red", width: 3 })];
      });
    case "fill":
      return [
        path(polyline(step.vertices.map(at), true), {
          color: step.color ?? "red",
          fill: "shade",
        }),
      ];
    case "label": {
      const p = at(step.name);
      const away = unit({ x: p.x - centroid.x, y: p.y - centroid.y });
      return [
        text(p.x + away.x * 60, p.y + away.y * 60 + 10, step.value, {
          color: step.color ?? "red",
          size: 28,
        }),
      ];
    }
  }
}

function ticks(a: Pt, b: Pt, count: number): string {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = unit({ x: b.x - a.x, y: b.y - a.y });
  const n = { x: -u.y, y: u.x };
  return Array.from({ length: clamp(count, 1, 3) }, (_, i) => {
    const offset = (i - (count - 1) / 2) * 10;
    const c = { x: mid.x + u.x * offset, y: mid.y + u.y * offset };
    return line(
      { x: c.x - n.x * 14, y: c.y - n.y * 14 },
      { x: c.x + n.x * 14, y: c.y + n.y * 14 },
    );
  }).join(" ");
}

function chevron(a: Pt, b: Pt): string {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = unit({ x: b.x - a.x, y: b.y - a.y });
  const n = { x: -u.y, y: u.x };
  const tip = { x: mid.x + u.x * 10, y: mid.y + u.y * 10 };
  return polyline([
    { x: tip.x - u.x * 16 + n.x * 12, y: tip.y - u.y * 16 + n.y * 12 },
    tip,
    { x: tip.x - u.x * 16 - n.x * 12, y: tip.y - u.y * 16 - n.y * 12 },
  ]);
}

// ── Layout ───────────────────────────────────────────────────────────────────

/** Uniform scale that fits every point (and circle) into the board, y flipped. */
function fit(
  points: Pt[],
  circles: Array<{ center: Pt; radius: number }>,
): View {
  const xs = [
    ...points.map((p) => p.x),
    ...circles.flatMap((c) => [c.center.x - c.radius, c.center.x + c.radius]),
  ];
  const ys = [
    ...points.map((p) => p.y),
    ...circles.flatMap((c) => [c.center.y - c.radius, c.center.y + c.radius]),
  ];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(
    (FIGURE_WIDTH - 2 * PAD) / spanX,
    (MAX_HEIGHT - 2 * PAD) / spanY,
  );
  const height = Math.max(MIN_HEIGHT, spanY * scale + 2 * PAD);
  const offsetX = (FIGURE_WIDTH - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return {
    scale,
    height,
    map: (p) => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (maxY - p.y) * scale,
    }),
  };
}

const PAD = 90;
const MAX_HEIGHT = 720;
const MIN_HEIGHT = 260;

// ── Helpers ──────────────────────────────────────────────────────────────────

function need(points: Map<string, Pt>, name: string): Pt {
  const point = points.get(name);
  if (!point)
    throw new FigureError(`point "${name}" is used before it is defined`);
  return point;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function unit(v: Pt): Pt {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

function average(points: Pt[]): Pt {
  const n = Math.max(points.length, 1);
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface View {
  scale: number;
  height: number;
  map: (p: Pt) => Pt;
}

type PointRule =
  | { at: Pt }
  | { polar: [string, number, number] }
  | { midpoint: string[] }
  | { foot: string[] }
  | { along: [string, string, number] }
  | { intersect: [string[], string[]] };

interface PointStep {
  kind: "point";
  name: string;
  rule: PointRule;
  color?: InkColor;
}

type Step =
  | PointStep
  | {
      kind: "segment";
      ends: string[];
      dashed: boolean;
      label?: string;
      color?: InkColor;
    }
  | { kind: "polygon"; vertices: string[]; color?: InkColor }
  | {
      kind: "circle";
      center: string;
      radius: number;
      through?: string;
      dashed: boolean;
      color?: InkColor;
    }
  | {
      kind: "angle";
      vertices: string[];
      right: boolean;
      label?: string;
      color?: InkColor;
    }
  | { kind: "equal"; segments: string[][]; ticks: number; color?: InkColor }
  | { kind: "parallel"; segments: string[][]; color?: InkColor }
  | { kind: "fill"; vertices: string[]; color?: InkColor }
  | { kind: "label"; name: string; value: string; color?: InkColor };
