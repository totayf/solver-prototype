import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  arrow,
  circle,
  FIGURE_WIDTH,
  type FigureRender,
  line,
  type Pt,
  path,
  polyline,
  text,
} from "./svg";

/**
 * Free-body diagram: a box (on optional ground, optionally inclined) or a
 * point, with force arrows. Angles are degrees counter-clockwise from +x
 * (90 = up); `size` is relative length (1 = normal). Later draws add forces.
 */
export const forcesSpec = z.object({
  body: z.enum(["box", "point"]).optional(),
  label: z.string().optional(),
  ground: z.boolean().optional(),
  incline: z.number().min(0).max(75).optional(),
  forces: z
    .array(
      z.object({
        angle: z.number(),
        size: z.number().positive().max(2.5).optional(),
        label: z.string(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderForces(
  specs: z.infer<typeof forcesSpec>[],
): FigureRender {
  // Lay out around y = 0 once to measure, then shift so everything fits.
  const probe = layout(specs, 0);
  const top = Math.min(...probe.ys);
  const bottom = Math.max(...probe.ys);
  const { parts } = layout(specs, PAD - top);
  return { height: Math.max(MIN_HEIGHT, bottom - top + 2 * PAD), parts };
}

function layout(specs: z.infer<typeof forcesSpec>[], centerY: number) {
  const {
    body = "box",
    label,
    ground = body === "box",
    incline = 0,
  } = specs[0];
  const center: Pt = { x: FIGURE_WIDTH / 2, y: centerY };
  const ys: number[] = [center.y - 20, center.y + 20];
  const seen = (p: Pt) => {
    ys.push(p.y);
    return p;
  };
  const tilt = (-incline * Math.PI) / 180;
  const rotate = (p: Pt): Pt =>
    seen({
      x:
        center.x +
        (p.x - center.x) * Math.cos(tilt) -
        (p.y - center.y) * Math.sin(tilt),
      y:
        center.y +
        (p.x - center.x) * Math.sin(tilt) +
        (p.y - center.y) * Math.cos(tilt),
    });

  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      if (body === "box") {
        const corners = [
          { x: center.x - BOX_W / 2, y: center.y - BOX_H / 2 },
          { x: center.x + BOX_W / 2, y: center.y - BOX_H / 2 },
          { x: center.x + BOX_W / 2, y: center.y + BOX_H / 2 },
          { x: center.x - BOX_W / 2, y: center.y + BOX_H / 2 },
        ].map(rotate);
        out.push(path(polyline(corners, true)));
        if (ground) {
          const groundY = center.y + BOX_H / 2;
          const a = rotate({ x: center.x - 360, y: groundY });
          const b = rotate({ x: center.x + 360, y: groundY });
          const hatch = Array.from({ length: 12 }, (_, i) => {
            const p = rotate({ x: center.x - 330 + i * 60, y: groundY });
            const q = rotate({ x: center.x - 360 + i * 60, y: groundY + 28 });
            return line(p, q);
          });
          out.push(path([line(a, b), ...hatch].join(" "), { width: 3 }));
        }
      } else {
        out.push(path(circle(center, 10), { fill: "solid" }));
      }
      if (label) out.push(text(center.x, center.y + 11, label, { size: 30 }));
    }
    for (const force of spec.forces) {
      const color = force.color ?? "red";
      const rad = (force.angle * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: -Math.sin(rad) };
      const start = body === "box" ? edgePoint(dir, tilt) : 0;
      const length = 60 + 110 * (force.size ?? 1);
      const from = { x: center.x + dir.x * start, y: center.y + dir.y * start };
      const tip = seen({
        x: from.x + dir.x * length,
        y: from.y + dir.y * length,
      });
      const at = seen({
        x: tip.x + dir.x * 40,
        y: tip.y + dir.y * 40 + 10,
      });
      ys.push(at.y - 30, at.y + 10);
      out.push(path(arrow(from, tip, 24), { color, width: 5 }));
      out.push(text(at.x, at.y, force.label, { color, size: 30 }));
    }
    return out;
  });
  return { parts, ys };
}

/** Distance from the box center to its edge along `dir` (box rotated by `tilt`). */
function edgePoint(dir: Pt, tilt: number): number {
  const local = {
    x: dir.x * Math.cos(-tilt) - dir.y * Math.sin(-tilt),
    y: dir.x * Math.sin(-tilt) + dir.y * Math.cos(-tilt),
  };
  const tx =
    Math.abs(local.x) > 1e-9
      ? BOX_W / 2 / Math.abs(local.x)
      : Number.POSITIVE_INFINITY;
  const ty =
    Math.abs(local.y) > 1e-9
      ? BOX_H / 2 / Math.abs(local.y)
      : Number.POSITIVE_INFINITY;
  return Math.min(tx, ty);
}

const PAD = 40;
const MIN_HEIGHT = 360;
const BOX_W = 150;
const BOX_H = 100;
