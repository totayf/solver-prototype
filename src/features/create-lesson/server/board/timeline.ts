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
 * Timeline for history/chronology questions: events at numeric positions
 * (years), date above the line, text below (alternating rows so neighbours
 * don't collide). Later draws add events.
 */
export const timelineSpec = z.object({
  range: z.tuple([z.number(), z.number()]).optional(),
  events: z
    .array(
      z.object({
        at: z.number(),
        label: z.string().optional(),
        text: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderTimeline(
  specs: z.infer<typeof timelineSpec>[],
): FigureRender {
  const all = specs.flatMap((spec) => spec.events.map((e) => e.at));
  const [min, max] = specs[0].range ?? [Math.min(...all), Math.max(...all)];
  if (!Number.isFinite(min) || !Number.isFinite(max))
    throw new FigureError("timeline needs a range or at least one event");
  const span = max - min || 1;
  const x = (value: number) =>
    PAD +
    ((value - (max === min ? min - 0.5 : min)) / (max === min ? 1 : span)) *
      (FIGURE_WIDTH - 2 * PAD);
  if (all.some((at) => at < min || at > max))
    throw new FigureError(`an event lies outside the range [${min}, ${max}]`);

  const above = rows([LINE_Y - 30, LINE_Y - 68]);
  const below = rows([LINE_Y + 60, LINE_Y + 100, LINE_Y + 140]);
  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      const a = { x: PAD - 50, y: LINE_Y };
      const b = { x: FIGURE_WIDTH - PAD + 50, y: LINE_Y };
      out.push(path(`${line(a, b)} ${arrowHead(a, b, 18)}`, { width: 4 }));
    }
    for (const event of spec.events) {
      const color = event.color ?? "red";
      const p = { x: x(event.at), y: LINE_Y };
      const label = event.label ?? String(event.at);
      out.push(path(circle(p, 9), { color, fill: "solid" }));
      out.push(
        text(p.x, above.place(p.x, label, 28), label, { color, size: 28 }),
      );
      if (event.text) {
        out.push(
          text(p.x, below.place(p.x, event.text, 24), event.text, { size: 24 }),
        );
      }
    }
    return out;
  });
  return { height: HEIGHT, parts };
}

/**
 * Text rows that never overlap: each text goes into the first row where its
 * (estimated) width is free, so close dates stack instead of colliding.
 */
function rows(ys: number[]) {
  const taken: Array<Array<[number, number]>> = ys.map(() => []);
  return {
    place(x: number, value: string, size: number): number {
      const half = (value.length * size * 0.65) / 2 + 8;
      const index = taken.findIndex((row) =>
        row.every(([from, to]) => x + half < from || x - half > to),
      );
      const row = index === -1 ? ys.length - 1 : index;
      taken[row].push([x - half, x + half]);
      return ys[row];
    },
  };
}

const PAD = 110;
const LINE_Y = 140;
const HEIGHT = 310;
