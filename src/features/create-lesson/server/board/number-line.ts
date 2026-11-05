import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  arrowHead,
  circle,
  FIGURE_WIDTH,
  FigureError,
  type FigureRender,
  line,
  path,
  text,
} from "./svg";

/**
 * Number line with marked points and intervals (inequality solutions).
 * `null` as an interval end means ∓∞. The first draw sets the range.
 */
export const numberLineSpec = z.object({
  range: z.tuple([z.number(), z.number()]).optional(),
  step: z.number().positive().optional(),
  points: z
    .array(
      z.object({
        at: z.number(),
        label: z.string().optional(),
        open: z.boolean().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  intervals: z
    .array(
      z.object({
        from: z.number().nullable(),
        to: z.number().nullable(),
        openFrom: z.boolean().optional(),
        openTo: z.boolean().optional(),
        label: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderNumberLine(
  specs: z.infer<typeof numberLineSpec>[],
): FigureRender {
  const { range, step } = specs[0];
  if (!range || !(range[1] > range[0]))
    throw new FigureError(
      'the first numberLine draw must set "range": [min, max]',
    );
  const [min, max] = range;
  const tickStep = step ?? niceStep(max - min);
  const x = (value: number) =>
    PAD + ((value - min) / (max - min)) * (FIGURE_WIDTH - 2 * PAD);
  const axisY = HEIGHT - 80;

  let lane = 0;
  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      const ticks: string[] = [];
      const labels: FigurePart[] = [];
      for (
        let v = Math.ceil(min / tickStep) * tickStep;
        v <= max + 1e-9;
        v += tickStep
      ) {
        const value = Number(v.toFixed(6));
        ticks.push(
          line({ x: x(value), y: axisY - 10 }, { x: x(value), y: axisY + 10 }),
        );
        labels.push(text(x(value), axisY + 46, format(value), { size: 26 }));
      }
      const left = { x: PAD - 40, y: axisY };
      const right = { x: FIGURE_WIDTH - PAD + 40, y: axisY };
      out.push(
        path(
          [
            line(left, right),
            arrowHead(left, right, 18),
            arrowHead(right, left, 18),
            ...ticks,
          ].join(" "),
          { width: 3 },
        ),
        ...labels,
      );
    }
    for (const point of spec.points) {
      const color = point.color ?? "red";
      const p = { x: x(point.at), y: axisY };
      out.push(
        path(circle(p, 9), { color, fill: point.open ? undefined : "solid" }),
      );
      if (point.label)
        out.push(text(p.x, axisY - 26, point.label, { color, size: 26 }));
    }
    for (const interval of spec.intervals) {
      const color = interval.color ?? "red";
      const y = axisY - 62 - lane * 34;
      lane += 1;
      const a = { x: interval.from === null ? PAD - 30 : x(interval.from), y };
      const b = {
        x: interval.to === null ? FIGURE_WIDTH - PAD + 30 : x(interval.to),
        y,
      };
      const strokes = [line(a, b)];
      if (interval.from === null) strokes.push(arrowHead(b, a, 16));
      if (interval.to === null) strokes.push(arrowHead(a, b, 16));
      out.push(path(strokes.join(" "), { color, width: 6 }));
      if (interval.from !== null)
        out.push(
          path(circle(a, 9), {
            color,
            fill: interval.openFrom ? undefined : "solid",
          }),
        );
      if (interval.to !== null)
        out.push(
          path(circle(b, 9), {
            color,
            fill: interval.openTo ? undefined : "solid",
          }),
        );
      if (interval.label)
        out.push(
          text((a.x + b.x) / 2, y - 18, interval.label, { color, size: 26 }),
        );
    }
    return out;
  });
  if (lane > 4)
    throw new FigureError(
      "a number line holds at most 4 intervals; start a new figure",
    );
  return { height: HEIGHT, parts };
}

function niceStep(span: number): number {
  return [1, 2, 5, 10, 20, 50, 100].find((s) => span / s <= 12) ?? span / 10;
}

function format(value: number): string {
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace(
    "-",
    "−",
  );
}

const PAD = 70;
const HEIGHT = 320;
