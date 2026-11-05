import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  circle,
  FigureError,
  type FigureRender,
  type Pt,
  path,
  polyline,
  text,
} from "./svg";

const REGIONS = [
  "A",
  "B",
  "C",
  "AB",
  "AC",
  "BC",
  "ABC",
  "onlyA",
  "onlyB",
  "onlyC",
  "out",
] as const;
type Region = (typeof REGIONS)[number];

/**
 * Venn diagram with 2 or 3 sets inside a universe box. Labels go into regions
 * (onlyA, AB, ABC, out …); shading takes whole sets or intersections.
 * Region names use the set's position (A, B, C), not its display name.
 */
export const vennSpec = z.object({
  sets: z.array(z.string()).min(2).max(3).optional(),
  labels: z
    .array(
      z.object({
        region: z.enum(REGIONS),
        text: z.string(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  shade: z
    .array(
      z.object({
        region: z.enum(["A", "B", "C", "AB", "AC", "BC", "ABC"]),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderVenn(specs: z.infer<typeof vennSpec>[]): FigureRender {
  const names = specs[0].sets;
  if (!names)
    throw new FigureError(
      'the first venn draw must set "sets": 2 or 3 set names',
    );
  const three = names.length === 3;
  const layout = three ? THREE : TWO;
  const circles = layout.centers.map((center) => ({
    center,
    radius: layout.radius,
  }));

  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      out.push(
        path(
          polyline(
            [
              { x: 40, y: 30 },
              { x: 960, y: 30 },
              { x: 960, y: layout.height - 30 },
              { x: 40, y: layout.height - 30 },
            ],
            true,
          ),
          { width: 3 },
        ),
      );
      out.push(text(70, 74, "E", { size: 30, anchor: "start" }));
      circles.forEach((c, i) => {
        out.push(path(circle(c.center, c.radius)));
        out.push(
          text(layout.names[i].x, layout.names[i].y, names[i], { size: 32 }),
        );
      });
    }
    for (const shade of spec.shade) {
      const indexes = [...shade.region].map((letter) => "ABC".indexOf(letter));
      if (indexes.some((i) => i >= names.length))
        throw new FigureError(`region ${shade.region} needs a third set`);
      out.push(
        path(polyline(regionOutline(indexes.map((i) => circles[i])), true), {
          color: shade.color ?? "red",
          fill: "shade",
        }),
      );
    }
    for (const label of spec.labels) {
      const anchor = layout.labels[label.region];
      if (!anchor)
        throw new FigureError(
          `region ${label.region} does not exist with ${names.length} sets`,
        );
      out.push(
        text(anchor.x, anchor.y, label.text, {
          color: label.color ?? "red",
          size: 30,
        }),
      );
    }
    return out;
  });
  return { height: layout.height, parts };
}

/** Outline of the intersection of circles, sampled into points. */
function regionOutline(circles: Array<{ center: Pt; radius: number }>): Pt[] {
  const inside = (p: Pt) =>
    circles.every(
      (c) => Math.hypot(p.x - c.center.x, p.y - c.center.y) <= c.radius + 0.5,
    );
  const points: Pt[] = [];
  for (const c of circles) {
    for (let i = 0; i < 180; i++) {
      const angle = (i / 180) * 2 * Math.PI;
      const p = {
        x: c.center.x + c.radius * Math.cos(angle),
        y: c.center.y + c.radius * Math.sin(angle),
      };
      if (inside(p)) points.push(p);
    }
  }
  const mid = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
  return points.sort(
    (a, b) =>
      Math.atan2(a.y - mid.y, a.x - mid.x) -
      Math.atan2(b.y - mid.y, b.x - mid.x),
  );
}

interface Layout {
  height: number;
  radius: number;
  centers: Pt[];
  names: Pt[];
  labels: Partial<Record<Region, Pt>>;
}

const TWO: Layout = {
  height: 500,
  radius: 180,
  centers: [
    { x: 390, y: 270 },
    { x: 610, y: 270 },
  ],
  names: [
    { x: 250, y: 100 },
    { x: 750, y: 100 },
  ],
  labels: {
    A: { x: 300, y: 280 },
    onlyA: { x: 300, y: 280 },
    B: { x: 700, y: 280 },
    onlyB: { x: 700, y: 280 },
    AB: { x: 500, y: 280 },
    out: { x: 900, y: 440 },
  },
};

const THREE: Layout = {
  height: 700,
  radius: 170,
  centers: [
    { x: 400, y: 260 },
    { x: 600, y: 260 },
    { x: 500, y: 430 },
  ],
  names: [
    { x: 250, y: 110 },
    { x: 750, y: 110 },
    { x: 500, y: 650 },
  ],
  labels: {
    A: { x: 330, y: 220 },
    onlyA: { x: 330, y: 220 },
    B: { x: 670, y: 220 },
    onlyB: { x: 670, y: 220 },
    C: { x: 500, y: 520 },
    onlyC: { x: 500, y: 520 },
    AB: { x: 500, y: 200 },
    AC: { x: 400, y: 400 },
    BC: { x: 600, y: 400 },
    ABC: { x: 500, y: 330 },
    out: { x: 900, y: 640 },
  },
};
