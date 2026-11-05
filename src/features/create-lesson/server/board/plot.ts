import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";
import { compileFunction, derivativeOf } from "@/shared/server/math";

import {
  arrowHead,
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
import { penColor } from "./colors";

/**
 * Coordinate plane: axes with ticks, function graphs (mathjs syntax in x),
 * points, segments, guide lines, tangents and shaded areas. The first draw
 * fixes the window; later draws add items to the same plane.
 */
const pair = z.tuple([z.number(), z.number()]);

const plotItem = z
  .object({
    fn: z.string().optional(),
    point: pair.optional(),
    segment: z.tuple([pair, pair]).optional(),
    vline: z.number().optional(),
    hline: z.number().optional(),
    tangent: z.string().optional(),
    shade: z.string().optional(),
    text: z.string().optional(),
    // Modifiers
    at: z.union([z.number(), pair]).optional(),
    fn2: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
    label: z.string().optional(),
    open: z.boolean().optional(),
    dashed: z.boolean().optional(),
    color: penColor.optional(),
  })
  .strict();

export const plotSpec = z.object({
  x: pair.optional(),
  y: pair.optional(),
  items: z.array(plotItem).default([]),
});

type PlotItem = z.infer<typeof plotItem>;

export function renderPlot(specs: z.infer<typeof plotSpec>[]): FigureRender {
  const [first] = specs;
  if (!first.x || !first.y)
    throw new FigureError(
      'the first plot draw must set "x" and "y" ranges, e.g. "x":[-4,4],"y":[-3,5]',
    );
  const [x0, x1] = first.x;
  const [y0, y1] = first.y;
  if (!(x1 > x0) || !(y1 > y0))
    throw new FigureError("plot ranges must be [min, max] with min < max");

  const height = clamp((FIGURE_WIDTH * (y1 - y0)) / (x1 - x0), 460, 760);
  const view: View = {
    x0,
    x1,
    y0,
    y1,
    height,
    map: (x, y) => ({
      x: PAD + ((x - x0) / (x1 - x0)) * (FIGURE_WIDTH - 2 * PAD),
      y: height - PAD - ((y - y0) / (y1 - y0)) * (height - 2 * PAD),
    }),
  };

  const parts = specs.map((spec, index) => [
    ...(index === 0 ? axes(view) : []),
    ...spec.items.flatMap((item) => drawItem(item, view)),
  ]);
  return { height, parts };
}

// ── Axes ─────────────────────────────────────────────────────────────────────

function axes(view: View): FigurePart[] {
  const { x0, x1, y0, y1, map } = view;
  const originY = clamp(0, y0, y1);
  const originX = clamp(0, x0, x1);
  const left = map(x0, originY);
  const right = map(x1, originY);
  const bottom = map(originX, y0);
  const top = map(originX, y1);
  const tick = 9;

  const xTicks = ticks(x0, x1).map((value) => {
    const p = map(value, originY);
    return { value, p };
  });
  const yTicks = ticks(y0, y1).map((value) => {
    const p = map(originX, value);
    return { value, p };
  });

  const strokes = [
    line(left, { x: right.x + 26, y: right.y }),
    arrowHead(left, { x: right.x + 26, y: right.y }, 18),
    line(bottom, { x: top.x, y: top.y - 26 }),
    arrowHead(bottom, { x: top.x, y: top.y - 26 }, 18),
    ...xTicks.map(({ p }) =>
      line({ x: p.x, y: p.y - tick }, { x: p.x, y: p.y + tick }),
    ),
    ...yTicks.map(({ p }) =>
      line({ x: p.x - tick, y: p.y }, { x: p.x + tick, y: p.y }),
    ),
  ];

  return [
    path(strokes.join(" "), { width: 3 }),
    text(right.x + 30, right.y + 34, "x", { size: 30 }),
    text(top.x + 26, top.y - 14, "y", { size: 30 }),
    ...xTicks
      .filter(({ value }) => value !== 0)
      .map(({ value, p }) => text(p.x, p.y + 38, format(value), { size: 24 })),
    ...yTicks
      .filter(({ value }) => value !== 0)
      .map(({ value, p }) =>
        text(p.x - 16, p.y + 8, format(value), { size: 24, anchor: "end" }),
      ),
    ...(x0 <= 0 && 0 <= x1 && y0 <= 0 && 0 <= y1
      ? [
          text(map(0, 0).x - 16, map(0, 0).y + 30, "O", {
            size: 24,
            anchor: "end",
          }),
        ]
      : []),
  ];
}

/** Integer-friendly tick values: every unit when it fits, otherwise a round step. */
function ticks(min: number, max: number): number[] {
  const span = max - min;
  const step =
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find(
      (s) => span / s <= 12,
    ) ?? span / 10;
  const values: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
    values.push(Number(v.toFixed(6)));
  return values;
}

// ── Items ────────────────────────────────────────────────────────────────────

function drawItem(item: PlotItem, view: View): FigurePart[] {
  const color = item.color ?? "red";
  const { map } = view;

  if (item.fn !== undefined) {
    const f = compile(item.fn);
    const d = graph(f, view, item.from ?? view.x0, item.to ?? view.x1);
    if (!d)
      throw new FigureError(
        `fn "${item.fn}" has no visible part in this window`,
      );
    const parts = [path(d, { color: item.color ?? "ink" })];
    if (item.label)
      parts.push(labelAtEnd(f, item.label, view, item.color ?? "ink"));
    return parts;
  }
  if (item.point) {
    const p = map(...item.point);
    const parts = [
      path(circle(p, 7), { color, fill: item.open ? undefined : "solid" }),
    ];
    if (item.dashed) {
      const onX = map(item.point[0], clamp(0, view.y0, view.y1));
      const onY = map(clamp(0, view.x0, view.x1), item.point[1]);
      parts.unshift(
        path(`${dashedLine(p, onX, 12, 9)} ${dashedLine(p, onY, 12, 9)}`, {
          color,
          width: 2.5,
        }),
      );
    }
    if (item.label)
      parts.push(
        text(p.x + 14, p.y - 16, item.label, {
          color,
          size: 26,
          anchor: "start",
        }),
      );
    return parts;
  }
  if (item.segment) {
    const [a, b] = item.segment.map(([x, y]) => map(x, y));
    const parts = [
      path(item.dashed ? dashedLine(a, b) : line(a, b), { color }),
    ];
    if (item.label)
      parts.push(
        text((a.x + b.x) / 2 + 12, (a.y + b.y) / 2 - 14, item.label, {
          color,
          size: 26,
          anchor: "start",
        }),
      );
    return parts;
  }
  if (item.vline !== undefined) {
    const a = map(item.vline, view.y0);
    const b = map(item.vline, view.y1);
    return [
      path(item.dashed === false ? line(a, b) : dashedLine(a, b), {
        color,
        width: 3,
      }),
      ...(item.label
        ? [
            text(b.x + 10, b.y + 26, item.label, {
              color,
              size: 26,
              anchor: "start",
            }),
          ]
        : []),
    ];
  }
  if (item.hline !== undefined) {
    const a = map(view.x0, item.hline);
    const b = map(view.x1, item.hline);
    return [
      path(item.dashed === false ? line(a, b) : dashedLine(a, b), {
        color,
        width: 3,
      }),
      ...(item.label
        ? [text(b.x, b.y - 12, item.label, { color, size: 26, anchor: "end" })]
        : []),
    ];
  }
  if (item.tangent !== undefined) {
    const at = item.at;
    if (typeof at !== "number")
      throw new FigureError('tangent needs "at": the x of the touching point');
    const f = compile(item.tangent);
    const slope = compile(derivativeOf(item.tangent))(at);
    const y = f(at);
    if (!Number.isFinite(slope) || !Number.isFinite(y))
      throw new FigureError(
        `tangent: "${item.tangent}" is not differentiable at x = ${item.at}`,
      );
    const d = graph((x) => y + slope * (x - at), view, view.x0, view.x1);
    const touch = map(at, y);
    return [
      path(d ?? "", { color, width: 3 }),
      path(circle(touch, 6), { color, fill: "solid" }),
      ...(item.label
        ? [
            text(touch.x + 14, touch.y + 30, item.label, {
              color,
              size: 26,
              anchor: "start",
            }),
          ]
        : []),
    ];
  }
  if (item.shade !== undefined) {
    if (item.from === undefined || item.to === undefined)
      throw new FigureError('shade needs "from" and "to"');
    const f = compile(item.shade);
    const g = item.fn2 ? compile(item.fn2) : () => 0;
    const n = 80;
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const x = item.from + ((item.to - item.from) * i) / n;
      upper.push(map(x, clamp(f(x), view.y0, view.y1)));
      lower.push(map(x, clamp(g(x), view.y0, view.y1)));
    }
    return [
      path(polyline([...upper, ...lower.reverse()], true), {
        color,
        fill: "shade",
      }),
    ];
  }
  if (item.text !== undefined) {
    if (!Array.isArray(item.at))
      throw new FigureError('text needs "at": [x, y]');
    const p = map(...item.at);
    return [text(p.x, p.y, item.text, { color, size: 28 })];
  }
  throw new FigureError(
    `plot item needs one of fn, point, segment, vline, hline, tangent, shade, text: ${JSON.stringify(item)}`,
  );
}

/** Samples a function into strokes, lifting the pen at gaps, poles and edges. */
function graph(
  f: (x: number) => number,
  view: View,
  from: number,
  to: number,
): string | null {
  const n = 500;
  const span = view.y1 - view.y0;
  const strokes: Pt[][] = [];
  let current: Pt[] = [];
  let previous: number | null = null;

  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    const y = f(x);
    const visible =
      Number.isFinite(y) &&
      y >= view.y0 - span * 0.02 &&
      y <= view.y1 + span * 0.02;
    const jump = previous !== null && Math.abs(y - previous) > span * 0.6;
    if (!visible || jump) {
      if (current.length > 1) strokes.push(current);
      current = [];
    }
    if (visible) current.push(view.map(x, clamp(y, view.y0, view.y1)));
    previous = Number.isFinite(y) ? y : null;
  }
  if (current.length > 1) strokes.push(current);
  return strokes.length ? strokes.map((s) => polyline(s)).join(" ") : null;
}

function labelAtEnd(
  f: (x: number) => number,
  label: string,
  view: View,
  color: FigurePart["color"],
): FigurePart {
  for (let i = 0; i <= 100; i++) {
    const x =
      view.x1 - ((view.x1 - view.x0) * i) / 100 - (view.x1 - view.x0) * 0.04;
    const y = f(x);
    if (Number.isFinite(y) && y >= view.y0 && y <= view.y1) {
      const p = view.map(x, y);
      return text(p.x - 8, p.y - 18, label, { color, size: 28, anchor: "end" });
    }
  }
  return text(FIGURE_WIDTH - PAD, PAD, label, {
    color,
    size: 28,
    anchor: "end",
  });
}

function compile(expression: string): (x: number) => number {
  try {
    const f = compileFunction(expression);
    f(0.5);
    return (x) => {
      try {
        return f(x);
      } catch {
        return Number.NaN;
      }
    };
  } catch (error) {
    throw new FigureError(
      `cannot read "${expression}" (mathjs syntax in x, e.g. "x^2 - 4x + 3"): ${error instanceof Error ? error.message : error}`,
    );
  }
}

function format(value: number): string {
  return Number.isInteger(value)
    ? String(value).replace("-", "−")
    : value.toFixed(1).replace("-", "−");
}

const PAD = 70;

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  height: number;
  map: (x: number, y: number) => Pt;
}
