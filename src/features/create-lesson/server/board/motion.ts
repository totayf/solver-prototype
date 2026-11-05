import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  arrow,
  circle,
  dashedLine,
  FIGURE_WIDTH,
  FigureError,
  type FigureRender,
  line,
  path,
  text,
} from "./svg";

/**
 * Motion problems: a road with named places, each mover as an arrow on its own
 * lane (label = speed or time), and an optional meeting point. Positions are
 * in the problem's own unit (km, m); the road is scaled to fit.
 */
export const motionSpec = z.object({
  points: z.array(z.object({ at: z.number(), label: z.string() })).default([]),
  movers: z
    .array(
      z.object({
        from: z.number(),
        to: z.number(),
        label: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  meet: z.object({ at: z.number(), label: z.string().optional() }).optional(),
});

export function renderMotion(
  specs: z.infer<typeof motionSpec>[],
): FigureRender {
  const positions = specs.flatMap((spec) => [
    ...spec.points.map((p) => p.at),
    ...spec.movers.flatMap((m) => [m.from, m.to]),
    ...(spec.meet ? [spec.meet.at] : []),
  ]);
  if (positions.length < 2)
    throw new FigureError(
      "motion needs at least two positions (points or movers)",
    );
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  if (max === min)
    throw new FigureError("motion positions must not all be equal");

  const lanes = specs.reduce((sum, spec) => sum + spec.movers.length, 0);
  const height = 190 + lanes * LANE;
  const roadY = height - 90;
  const x = (value: number) =>
    PAD + ((value - min) / (max - min)) * (FIGURE_WIDTH - 2 * PAD);

  let lane = 0;
  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0)
      out.push(
        path(
          line(
            { x: PAD - 30, y: roadY },
            { x: FIGURE_WIDTH - PAD + 30, y: roadY },
          ),
          { width: 5 },
        ),
      );
    for (const point of spec.points) {
      const p = { x: x(point.at), y: roadY };
      out.push(
        path(line({ x: p.x, y: roadY - 14 }, { x: p.x, y: roadY + 14 }), {
          width: 4,
        }),
      );
      out.push(text(p.x, roadY + 52, point.label, { size: 30 }));
    }
    for (const mover of spec.movers) {
      const color = mover.color ?? "red";
      const y = roadY - 60 - lane * LANE;
      lane += 1;
      const from = { x: x(mover.from), y };
      const to = { x: x(mover.to), y };
      out.push(
        path(circle(from, 7), { color, fill: "solid" }),
        path(arrow(from, to), { color }),
      );
      if (mover.label)
        out.push(
          text((from.x + to.x) / 2, y - 18, mover.label, { color, size: 28 }),
        );
    }
    if (spec.meet) {
      const meetX = x(spec.meet.at);
      out.push(
        path(
          dashedLine(
            { x: meetX, y: roadY },
            { x: meetX, y: roadY - 60 - Math.max(lanes - 1, 0) * LANE - 30 },
            12,
            9,
          ),
          { color: "red", width: 3 },
        ),
      );
      out.push(
        path(circle({ x: meetX, y: roadY }, 10), {
          color: "red",
          fill: "solid",
        }),
      );
      if (spec.meet.label)
        out.push(
          text(meetX, roadY + 52, spec.meet.label, { color: "red", size: 28 }),
        );
    }
    return out;
  });
  return { height, parts };
}

const PAD = 90;
const LANE = 80;
