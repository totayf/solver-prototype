import { z } from "zod";

import type { FigurePart, InkColor } from "@/entities/lesson";

import { penColor } from "./colors";
import {
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

/**
 * 3D solids drawn the way textbooks do: an oblique projection (depth goes
 * up-right), hidden edges dashed. Polyhedra (box, prism, pyramid) have named
 * vertices that later draws connect (diagonals, heights), fill (sections) or
 * label (edge lengths). Curved solids (cylinder, cone, sphere) get their
 * radius and height marked.
 *
 * Coordinates: x right, y depth (away from the viewer), z up, in the
 * problem's own units; the figure is scaled to fit.
 */
const point3 = z.tuple([z.number(), z.number(), z.number()]);

export const solidSpec = z.object({
  shape: z
    .enum(["box", "prism", "pyramid", "cylinder", "cone", "sphere"])
    .optional(),
  size: point3.optional(),
  base: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3)
    .optional(),
  height: z.number().positive().optional(),
  apex: z.tuple([z.number(), z.number()]).optional(),
  radius: z.number().positive().optional(),
  names: z.array(z.string()).optional(),
  points: z
    .array(
      z.object({
        name: z.string(),
        at: point3.optional(),
        mid: z.tuple([z.string(), z.string()]).optional(),
        along: z.tuple([z.string(), z.string(), z.number()]).optional(),
      }),
    )
    .default([]),
  segments: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        dashed: z.boolean().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  faces: z
    .array(
      z.object({
        vertices: z.array(z.string()).min(3),
        color: penColor.optional(),
      }),
    )
    .default([]),
  edgeLabels: z
    .array(
      z.object({
        edge: z.tuple([z.string(), z.string()]),
        text: z.string(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  radiusLabel: z.string().optional(),
  heightLabel: z.string().optional(),
});

type SolidSpec = z.infer<typeof solidSpec>;

export function renderSolid(specs: SolidSpec[]): FigureRender {
  const model = buildModel(specs[0]);
  const named = new Map(model.vertices.map((v) => [v.name, v.p]));
  for (const spec of specs) {
    for (const p of spec.points) named.set(p.name, resolvePoint(p, named));
  }

  // Fit every projected point into the board.
  const projected = [
    ...[...named.values()].map(project),
    ...model.extraPoints.map(project),
  ];
  const view = fit(projected);
  const at = (p: P3) => view(project(p));
  const center = average([...named.values()].map(at));
  const vertex = (name: string) => {
    const p = named.get(name);
    if (!p) {
      throw new FigureError(
        `unknown point "${name}"; vertices are ${model.vertices.map((v) => v.name).join(", ")}`,
      );
    }
    return p;
  };

  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      out.push(...model.draw(at));
      for (const v of model.vertices) {
        if (v.name.startsWith("_")) continue;
        out.push(label(at(v.p), center, v.name, "ink"));
      }
      if (model.measures) out.push(...model.measures(at, spec));
    }
    for (const p of spec.points) {
      if (p.name.startsWith("_")) continue;
      const q = at(vertex(p.name));
      out.push(
        path(dot(q), { color: "red", fill: "solid" }),
        label(q, center, p.name, "red"),
      );
    }
    for (const face of spec.faces) {
      const pts = face.vertices.map((n) => at(vertex(n)));
      out.push(
        path(polyline(pts, true), {
          color: face.color ?? "red",
          fill: "shade",
        }),
      );
    }
    for (const s of spec.segments) {
      const a = at(vertex(s.from));
      const b = at(vertex(s.to));
      const color = s.color ?? "red";
      out.push(
        path(s.dashed ? dashedLine(a, b, 14, 9) : line(a, b), {
          color,
          width: 3,
        }),
      );
      if (s.label) out.push(edgeText(a, b, center, s.label, color));
    }
    for (const e of spec.edgeLabels) {
      out.push(
        edgeText(
          at(vertex(e.edge[0])),
          at(vertex(e.edge[1])),
          center,
          e.text,
          e.color ?? "red",
        ),
      );
    }
    return out;
  });
  return { height: view.height, parts };
}

// ── Models ───────────────────────────────────────────────────────────────────

interface SolidModel {
  vertices: Array<{ name: string; p: P3 }>;
  /** Extra points that only matter for fitting (curved outlines). */
  extraPoints: P3[];
  draw: (at: (p: P3) => Pt) => FigurePart[];
  measures?: (at: (p: P3) => Pt, spec: SolidSpec) => FigurePart[];
}

function buildModel(spec: SolidSpec): SolidModel {
  switch (spec.shape) {
    case "box": {
      if (!spec.size)
        throw new FigureError('box needs "size": [width, depth, height]');
      const [w, d, h] = spec.size;
      const base: Array<[number, number]> = [
        [0, 0],
        [w, 0],
        [w, d],
        [0, d],
      ];
      return prism(base, h, spec.names);
    }
    case "prism":
      if (!spec.base || !spec.height)
        throw new FigureError(
          'prism needs "base" (ground polygon) and "height"',
        );
      return prism(spec.base, spec.height, spec.names);
    case "pyramid":
      if (!spec.base || !spec.height)
        throw new FigureError('pyramid needs "base" and "height"');
      return pyramid(spec.base, spec.height, spec.apex, spec.names);
    case "cylinder":
    case "cone":
      if (!spec.radius || !spec.height)
        throw new FigureError(`${spec.shape} needs "radius" and "height"`);
      return roundSolid(spec.shape, spec.radius, spec.height, spec.names);
    case "sphere":
      if (!spec.radius) throw new FigureError('sphere needs "radius"');
      return sphere(spec.radius, spec.names);
    default:
      throw new FigureError('the first solid draw must set "shape"');
  }
}

/** Prism over a ground polygon: bottom vertices, then the top ones above them. */
function prism(
  base: Array<[number, number]>,
  h: number,
  names?: string[],
): SolidModel {
  const n = base.length;
  const ring = orient(base);
  const labels = vertexNames(names, 2 * n);
  const vertices = [
    ...ring.map(([x, y], i) => ({ name: labels[i], p: [x, y, 0] as P3 })),
    ...ring.map(([x, y], i) => ({ name: labels[n + i], p: [x, y, h] as P3 })),
  ];
  const faces = [
    [...Array(n).keys()].reverse(),
    [...Array(n).keys()].map((i) => n + i),
    ...[...Array(n).keys()].map((i) => [
      i,
      (i + 1) % n,
      n + ((i + 1) % n),
      n + i,
    ]),
  ];
  const edges: Array<[number, number]> = [
    ...[...Array(n).keys()].map((i): [number, number] => [i, (i + 1) % n]),
    ...[...Array(n).keys()].map((i): [number, number] => [
      n + i,
      n + ((i + 1) % n),
    ]),
    ...[...Array(n).keys()].map((i): [number, number] => [i, n + i]),
  ];
  return polyhedron(vertices, faces, edges);
}

function pyramid(
  base: Array<[number, number]>,
  h: number,
  apex: [number, number] | undefined,
  names?: string[],
): SolidModel {
  const n = base.length;
  const ring = orient(base);
  const [ax, ay] = apex ?? [
    ring.reduce((s, p) => s + p[0], 0) / n,
    ring.reduce((s, p) => s + p[1], 0) / n,
  ];
  const labels = vertexNames(names, n + 1, true);
  const vertices = [
    ...ring.map(([x, y], i) => ({ name: labels[i], p: [x, y, 0] as P3 })),
    { name: labels[n], p: [ax, ay, h] as P3 },
  ];
  const faces = [
    [...Array(n).keys()].reverse(),
    ...[...Array(n).keys()].map((i) => [i, (i + 1) % n, n]),
  ];
  const edges: Array<[number, number]> = [
    ...[...Array(n).keys()].map((i): [number, number] => [i, (i + 1) % n]),
    ...[...Array(n).keys()].map((i): [number, number] => [i, n]),
  ];
  return polyhedron(vertices, faces, edges);
}

/** Edges hidden when every face they belong to faces away from the viewer. */
function polyhedron(
  vertices: Array<{ name: string; p: P3 }>,
  faces: number[][],
  edges: Array<[number, number]>,
): SolidModel {
  const centroid = average3(vertices.map((v) => v.p));
  const visible = faces.map((face) => {
    const [a, b, c] = face.map((i) => vertices[i].p);
    let normal = cross(sub(b, a), sub(c, a));
    if (dot3(normal, sub(a, centroid)) < 0) normal = scale3(normal, -1);
    return dot3(normal, VIEW) < -1e-9;
  });
  return {
    vertices,
    extraPoints: [],
    draw: (at) => {
      const solid: string[] = [];
      const hidden: string[] = [];
      for (const [i, j] of edges) {
        const seen = faces.some(
          (face, f) => visible[f] && face.includes(i) && face.includes(j),
        );
        const a = at(vertices[i].p);
        const b = at(vertices[j].p);
        (seen ? solid : hidden).push(
          seen ? line(a, b) : dashedLine(a, b, 12, 9),
        );
      }
      return [
        path(solid.join(" "), { width: 4 }),
        ...(hidden.length ? [path(hidden.join(" "), { width: 2.5 })] : []),
      ];
    },
  };
}

function roundSolid(
  shape: "cylinder" | "cone",
  r: number,
  h: number,
  names?: string[],
): SolidModel {
  const labels = vertexNames(
    names,
    2,
    true,
    shape === "cone" ? ["O", "T"] : ["O", "O'"],
  );
  const top: P3 = [0, 0, h];
  const rim = (z: number) => sampleCircle(r, z);
  const vertices = [
    { name: labels[0], p: [0, 0, 0] as P3 },
    { name: labels[1], p: top },
  ];
  return {
    vertices,
    extraPoints: [...rim(0), ...(shape === "cylinder" ? rim(h) : [])],
    draw: (at) => {
      const bottom = rim(0);
      // A rim point is hidden when the side surface there faces away.
      const sideVisible = (t: number) => {
        const normal: P3 =
          shape === "cylinder"
            ? [Math.cos(t), Math.sin(t), 0]
            : [Math.cos(t) * h, Math.sin(t) * h, r];
        return dot3(normal, VIEW) < 0;
      };
      const front: Pt[][] = [];
      const back: Pt[][] = [];
      splitByVisibility(bottom, sideVisible, at, front, back);
      const parts: FigurePart[] = [
        path(front.map((run) => polyline(run)).join(" "), { width: 4 }),
        path(back.map((run) => dashedPolyline(run)).join(" "), { width: 2.5 }),
      ];
      const projectedBottom = bottom.map(at);
      if (shape === "cylinder") {
        parts.push(path(polyline(rim(h).map(at), true), { width: 4 }));
        const [left, right] = extremesX(projectedBottom);
        const leftTop = at([...unproject(bottom, projectedBottom, left), h]);
        const rightTop = at([...unproject(bottom, projectedBottom, right), h]);
        parts.push(
          path(`${line(left, leftTop)} ${line(right, rightTop)}`, { width: 4 }),
        );
      } else {
        const apex = at(top);
        const [a, b] = tangentPoints(projectedBottom, apex);
        parts.push(path(`${line(a, apex)} ${line(b, apex)}`, { width: 4 }));
      }
      return parts;
    },
    measures: (at, spec) => measureParts(at, r, h, spec),
  };
}

function sphere(r: number, names?: string[]): SolidModel {
  const labels = vertexNames(names, 1, true, ["O"]);
  const equator = sampleCircle(r, 0);
  return {
    vertices: [{ name: labels[0], p: [0, 0, 0] }],
    extraPoints: [
      [-r, 0, 0],
      [r, 0, 0],
      [0, 0, r],
      [0, 0, -r],
    ],
    draw: (at) => {
      const c = at([0, 0, 0]);
      const radius = Math.abs(at([r, 0, 0]).x - c.x);
      const front: Pt[][] = [];
      const back: Pt[][] = [];
      splitByVisibility(
        equator,
        (t) => dot3([Math.cos(t), Math.sin(t), 0], VIEW) < 0,
        at,
        front,
        back,
      );
      return [
        path(polyline(sampleRing(c, radius), true), { width: 4 }),
        path(front.map((run) => polyline(run)).join(" "), { width: 3 }),
        path(back.map((run) => dashedPolyline(run)).join(" "), { width: 2.5 }),
      ];
    },
    measures: (at, spec) =>
      spec.radiusLabel
        ? [
            path(line(at([0, 0, 0]), at([r, 0, 0])), {
              color: "red",
              width: 3,
            }),
            text(
              (at([0, 0, 0]).x + at([r, 0, 0]).x) / 2,
              at([0, 0, 0]).y - 14,
              spec.radiusLabel,
              { color: "red", size: 28 },
            ),
          ]
        : [],
  };
}

function measureParts(
  at: (p: P3) => Pt,
  r: number,
  h: number,
  spec: SolidSpec,
): FigurePart[] {
  const parts: FigurePart[] = [];
  const o = at([0, 0, 0]);
  if (spec.radiusLabel) {
    const rim = at([r, 0, 0]);
    parts.push(
      path(line(o, rim), { color: "red", width: 3 }),
      text((o.x + rim.x) / 2, o.y + 30, spec.radiusLabel, {
        color: "red",
        size: 28,
      }),
    );
  }
  if (spec.heightLabel) {
    const top = at([0, 0, h]);
    parts.push(
      path(dashedLine(o, top, 12, 9), { color: "red", width: 3 }),
      text(o.x + 16, (o.y + top.y) / 2, spec.heightLabel, {
        color: "red",
        size: 28,
        anchor: "start",
      }),
    );
  }
  return parts;
}

// ── Projection ───────────────────────────────────────────────────────────────

/** Oblique (cabinet) projection: depth drawn up-right at half length. */
const DEPTH_ANGLE = (40 * Math.PI) / 180;
const DEPTH_SCALE = 0.5;
const C = DEPTH_SCALE * Math.cos(DEPTH_ANGLE);
const S = DEPTH_SCALE * Math.sin(DEPTH_ANGLE);
/** Direction the viewer looks along: every point on it lands on the same spot. */
const VIEW: P3 = [-C, 1, -S];

function project([x, y, z]: P3): Pt {
  return { x: x + C * y, y: -(z + S * y) };
}

function fit(points: Pt[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-6);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-6);
  const scale = Math.min(
    (FIGURE_WIDTH - 2 * PAD) / spanX,
    (MAX_HEIGHT - 2 * PAD) / spanY,
  );
  const height = clamp(spanY * scale + 2 * PAD, 260, MAX_HEIGHT);
  const offsetX = (FIGURE_WIDTH - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const map = (p: Pt): Pt => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  });
  return Object.assign(map, { height });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolvePoint(
  p: SolidSpec["points"][number],
  named: Map<string, P3>,
): P3 {
  const need = (n: string) => {
    const v = named.get(n);
    if (!v) throw new FigureError(`point "${n}" is used before it is defined`);
    return v;
  };
  if (p.at) return p.at;
  if (p.mid) return scale3(add(need(p.mid[0]), need(p.mid[1])), 0.5);
  if (p.along) {
    const [a, b, t] = p.along;
    return add(need(a), scale3(sub(need(b), need(a)), t));
  }
  throw new FigureError(`point ${p.name}: give "at", "mid" or "along"`);
}

function vertexNames(
  names: string[] | undefined,
  count: number,
  lastIsApex = false,
  fallback?: string[],
): string[] {
  if (names && names.length !== count) {
    throw new FigureError(`"names" needs ${count} names (got ${names.length})`);
  }
  if (names) return names;
  if (fallback) return fallback;
  const letters = "ABCDEFGHIJKLMNOPRSTUVYZ";
  return Array.from({ length: count }, (_, i) =>
    lastIsApex && i === count - 1 ? "T" : letters[i],
  );
}

/** Counter-clockwise seen from above, so face normals point outward. */
function orient(base: Array<[number, number]>): Array<[number, number]> {
  const area = base.reduce((s, [x1, y1], i) => {
    const [x2, y2] = base[(i + 1) % base.length];
    return s + x1 * y2 - x2 * y1;
  }, 0);
  return area >= 0 ? base : [...base].reverse();
}

function sampleCircle(r: number, z: number): P3[] {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const t = (i / SAMPLES) * 2 * Math.PI;
    return [r * Math.cos(t), r * Math.sin(t), z] as P3;
  });
}

function sampleRing(c: Pt, radius: number): Pt[] {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const t = (i / SAMPLES) * 2 * Math.PI;
    return { x: c.x + radius * Math.cos(t), y: c.y + radius * Math.sin(t) };
  });
}

/** Splits a closed rim into visible and hidden runs (rotated so runs don't wrap). */
function splitByVisibility(
  rim: P3[],
  visibleAt: (t: number) => boolean,
  at: (p: P3) => Pt,
  front: Pt[][],
  back: Pt[][],
) {
  const flags = rim.map((_, i) => visibleAt((i / rim.length) * 2 * Math.PI));
  const start = flags.findIndex(
    (f, i) => f !== flags[(i + rim.length - 1) % rim.length],
  );
  const offset = start === -1 ? 0 : start;
  let run: Pt[] = [];
  let current = flags[offset];
  for (let k = 0; k <= rim.length; k++) {
    const i = (offset + k) % rim.length;
    const p = at(rim[i]);
    if (flags[i] !== current) {
      run.push(p);
      (current ? front : back).push(run);
      run = [p];
      current = flags[i];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) (current ? front : back).push(run);
}

function dashedPolyline(points: Pt[]): string {
  return points
    .slice(1)
    .map((p, i) => (i % 2 === 0 ? line(points[i], p) : ""))
    .filter(Boolean)
    .join(" ");
}

function extremesX(points: Pt[]): [Pt, Pt] {
  let left = points[0];
  let right = points[0];
  for (const p of points) {
    if (p.x < left.x) left = p;
    if (p.x > right.x) right = p;
  }
  return [left, right];
}

/** The 3D rim point whose projection is `target` (same index). */
function unproject(rim: P3[], projected: Pt[], target: Pt): [number, number] {
  const i = projected.indexOf(target);
  return [rim[i][0], rim[i][1]];
}

/** Rim points where the lines from the apex just touch the projected base. */
function tangentPoints(rim: Pt[], apex: Pt): [Pt, Pt] {
  let minAngle = Number.POSITIVE_INFINITY;
  let maxAngle = Number.NEGATIVE_INFINITY;
  let a = rim[0];
  let b = rim[0];
  const base = Math.atan2(average(rim).y - apex.y, average(rim).x - apex.x);
  for (const p of rim) {
    let angle = Math.atan2(p.y - apex.y, p.x - apex.x) - base;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    if (angle < minAngle) {
      minAngle = angle;
      a = p;
    }
    if (angle > maxAngle) {
      maxAngle = angle;
      b = p;
    }
  }
  return [a, b];
}

function label(p: Pt, center: Pt, name: string, color: InkColor): FigurePart {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return text(p.x + (dx / length) * 30, p.y + (dy / length) * 30 + 10, name, {
    color,
    size: 30,
  });
}

function edgeText(
  a: Pt,
  b: Pt,
  center: Pt,
  value: string,
  color: InkColor,
): FigurePart {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return text(
    mid.x + (dx / length) * 28,
    mid.y + (dy / length) * 28 + 10,
    value,
    { color, size: 28 },
  );
}

function dot(p: Pt): string {
  return `M${p.x + 6} ${p.y} A6 6 0 1 1 ${p.x - 6} ${p.y} A6 6 0 1 1 ${p.x + 6} ${p.y}`;
}

function average(points: Pt[]): Pt {
  const n = Math.max(points.length, 1);
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function average3(points: P3[]): P3 {
  const n = Math.max(points.length, 1);
  return [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / n) as P3;
}

function add(a: P3, b: P3): P3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: P3, b: P3): P3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(a: P3, k: number): P3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function dot3(a: P3, b: P3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: P3, b: P3): P3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const PAD = 70;
const MAX_HEIGHT = 680;
const SAMPLES = 72;

type P3 = [number, number, number];
