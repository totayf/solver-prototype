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
  type Pt,
  path,
  polyline,
  text,
} from "./svg";

/**
 * Electric circuit on a grid: named nodes at grid points (x right, y up) and
 * elements between two nodes (a wire, or a symbol in the middle of the
 * segment with wire on both sides). Nodes where three or more branches meet
 * get a junction dot. Later draws add elements, current arrows along a
 * branch, or highlight branches.
 */
const ELEMENTS = [
  "wire",
  "resistor",
  "battery",
  "capacitor",
  "bulb",
  "switch",
  "ammeter",
  "voltmeter",
] as const;

export const circuitSpec = z.object({
  nodes: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
  elements: z
    .array(
      z.object({
        type: z.enum(ELEMENTS),
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        /** Switches only: drawn open unless closed. */
        closed: z.boolean().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  currents: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  highlight: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

type CircuitSpec = z.infer<typeof circuitSpec>;

export function renderCircuit(specs: CircuitSpec[]): FigureRender {
  const grid = specs[0].nodes;
  if (!grid || Object.keys(grid).length < 2) {
    throw new FigureError('the first circuit draw must set "nodes"');
  }
  const xs = Object.values(grid).map(([x]) => x);
  const ys = Object.values(grid).map(([, y]) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const unit = Math.min(
    MAX_UNIT,
    (FIGURE_WIDTH - 2 * SIDE_PAD) / Math.max(maxX - minX, 1),
  );
  const height = Math.max(MIN_HEIGHT, (maxY - minY) * unit + 2 * PAD);
  const offsetX = (FIGURE_WIDTH - (maxX - minX) * unit) / 2;
  const at = (name: string): Pt => {
    const p = grid[name];
    if (!p) {
      throw new FigureError(
        `no node "${name}"; nodes are ${Object.keys(grid).join(", ")}`,
      );
    }
    return {
      x: offsetX + (p[0] - minX) * unit,
      y: PAD + (maxY - p[1]) * unit,
    };
  };
  const center: Pt = { x: FIGURE_WIDTH / 2, y: height / 2 };

  const degree = new Map<string, number>();
  for (const spec of specs) {
    for (const e of spec.elements) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
  }

  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    for (const e of spec.elements) {
      const a = at(e.from);
      const b = at(e.to);
      if (Math.hypot(b.x - a.x, b.y - a.y) < SYMBOL + 10) {
        throw new FigureError(
          `${e.from}–${e.to} is too short for a ${e.type}; spread the nodes`,
        );
      }
      out.push(...element(e, a, b, center));
    }
    if (index === 0) {
      for (const [name, count] of degree) {
        const p = at(name);
        if (count >= 3) out.push(path(circle(p, 7), { fill: "solid" }));
        if (!name.startsWith("_")) out.push(nodeLabel(name, p, center));
      }
    }
    for (const c of spec.currents) {
      const a = at(c.from);
      const b = at(c.to);
      const color = c.color ?? "blue";
      const tip = lerp(a, b, 0.22);
      const tail = lerp(a, b, 0.1);
      out.push(path(arrowHead(tail, tip, 22), { color, width: 4 }));
      if (c.label) {
        out.push(sideLabel(c.label, tip, outward(a, b, center), 30, color));
      }
    }
    for (const h of spec.highlight) {
      out.push(
        path(line(at(h.from), at(h.to)), {
          color: h.color ?? "red",
          width: 9,
        }),
      );
    }
    return out;
  });
  return { height, parts };
}

// ── Symbols ──────────────────────────────────────────────────────────────────

function element(
  e: CircuitSpec["elements"][number],
  a: Pt,
  b: Pt,
  center: Pt,
): FigurePart[] {
  const color = e.color ?? "ink";
  if (e.type === "wire") return [path(line(a, b), { color, width: 3.5 })];

  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const v = { x: -u.y, y: u.x };
  const mid = lerp(a, b, 0.5);
  /** A point in the symbol's frame: s along the branch, t across it. */
  const p = (s: number, t: number): Pt => ({
    x: mid.x + u.x * s + v.x * t,
    y: mid.y + u.y * s + v.y * t,
  });
  const half = SYMBOL / 2;
  const leads = path(`${line(a, p(-half, 0))} ${line(p(half, 0), b)}`, {
    color,
    width: 3.5,
  });

  const out: FigurePart[] = [leads];
  const n = outward(a, b, center);
  switch (e.type) {
    case "resistor": {
      const zig: Pt[] = [p(-half, 0)];
      for (let i = 0; i < 6; i++) {
        zig.push(p(-half + (SYMBOL / 6) * (i + 0.5), i % 2 ? -14 : 14));
      }
      zig.push(p(half, 0));
      out.push(path(polyline(zig), { color, width: 3.5 }));
      break;
    }
    case "battery": {
      // The long plate is the + terminal, on the "to" side.
      out.push(
        path(
          `${line(p(-half, 0), p(-7, 0))} ${line(p(7, 0), p(half, 0))} ${line(p(7, -26), p(7, 26))}`,
          { color, width: 3.5 },
        ),
        path(line(p(-7, -13), p(-7, 13)), { color, width: 8 }),
        // The + sign goes on the inner side; the label takes the outer one.
        text(
          mid.x + u.x * 22 - n.x * 34,
          mid.y + u.y * 22 - n.y * 34 + 8,
          "+",
          { color, size: 24 },
        ),
      );
      break;
    }
    case "capacitor":
      out.push(
        path(
          `${line(p(-half, 0), p(-7, 0))} ${line(p(7, 0), p(half, 0))} ${line(p(-7, -24), p(-7, 24))} ${line(p(7, -24), p(7, 24))}`,
          { color, width: 4 },
        ),
      );
      break;
    case "bulb":
      out.push(
        path(
          `${circle(mid, 22)} ${line(p(-15, -15), p(15, 15))} ${line(p(-15, 15), p(15, -15))}`,
          { color, width: 3.5 },
        ),
        path(`${line(p(-half, 0), p(-22, 0))} ${line(p(22, 0), p(half, 0))}`, {
          color,
          width: 3.5,
        }),
      );
      break;
    case "switch": {
      const pivot = p(-half + 6, 0);
      const end = e.closed ? p(half - 6, 0) : p(half - 10, -26);
      out.push(
        path(`${circle(pivot, 6)} ${circle(p(half - 6, 0), 6)}`, {
          color,
          width: 3,
        }),
        path(line(pivot, end), { color, width: 4 }),
      );
      break;
    }
    case "ammeter":
    case "voltmeter":
      out.push(
        path(
          `${circle(mid, 24)} ${line(p(-half, 0), p(-24, 0))} ${line(p(24, 0), p(half, 0))}`,
          { color, width: 3.5 },
        ),
        text(mid.x, mid.y + 10, e.type === "ammeter" ? "A" : "V", {
          color,
          size: 28,
        }),
      );
      break;
  }
  if (e.label) out.push(sideLabel(e.label, mid, n, 46, color));
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeLabel(name: string, p: Pt, center: Pt): FigurePart {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const d = Math.hypot(dx, dy) || 1;
  return text(p.x + (dx / d) * 26, p.y + (dy / d) * 26 + 10, name, {
    size: 28,
  });
}

/** A label beside a branch: anchored so it grows away from the branch. */
function sideLabel(
  value: string,
  at: Pt,
  n: Pt,
  gap: number,
  color: FigurePart["color"],
): FigurePart {
  const anchor = n.x > 0.5 ? "start" : n.x < -0.5 ? "end" : "middle";
  return text(at.x + n.x * gap, at.y + n.y * gap + 10, value, {
    color,
    size: 26,
    anchor,
  });
}

/** The unit normal of a→b that points away from the figure's center. */
function outward(a: Pt, b: Pt, center: Pt): Pt {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const mid = lerp(a, b, 0.5);
  const away = (mid.x - center.x) * n.x + (mid.y - center.y) * n.y;
  return away >= 0 ? n : { x: -n.x, y: -n.y };
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const PAD = 70;
/** Room at the sides for labels of vertical branches. */
const SIDE_PAD = 170;
const MIN_HEIGHT = 260;
const MAX_UNIT = 220;
/** Length of an element's symbol along its branch. */
const SYMBOL = 72;
