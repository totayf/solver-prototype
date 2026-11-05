import rough from "roughjs";

import type {
  FigurePart,
  InkColor,
  LessonAction,
  Rect,
} from "@/entities/lesson";

/**
 * Hand-drawn SVG paths for a drawing action — in image pixels on the photo,
 * in figure units (1000 wide) on the board. roughjs gives the wobbly pen look;
 * the same seed always yields the same strokes, so a redraw after seeking
 * looks identical.
 */
export function sketchAction(action: LessonAction, seed: number): SketchPath[] {
  const color = "color" in action ? action.color : "red";
  const tinted = (paths: SketchPath[]) =>
    paths.map((p) => (p.kind === "ink" ? { ...p, color } : p));

  switch (action.type) {
    case "highlight":
      return action.rects.flatMap((r) => highlight(r, seed));
    case "underline":
      return tinted(action.rects.flatMap((r) => underline(r, seed)));
    case "strike":
      return tinted(action.rects.flatMap((r) => strike(r, seed)));
    case "circle":
      return tinted(circle(boundingBox(action.rects), seed));
    case "box":
      return tinted(box(boundingBox(action.rects), seed));
    case "reveal_answer":
      return action.rects.length ? box(boundingBox(action.rects), seed) : [];
    case "arrow":
      return tinted(arrow(action.from, action.to, seed));
    case "figure":
      return action.parts.flatMap((part, i) => figurePart(part, seed + i));
    default:
      return [];
  }
}

/** Stable numeric seed from an action key like "3-1". */
export function seedFor(key: string): number {
  let hash = 7;
  for (const char of key)
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  return hash;
}

export function boundingBox(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

// ── Shapes ───────────────────────────────────────────────────────────────────

const generator = rough.generator();

function highlight(r: Rect, seed: number): SketchPath[] {
  const y = r.y + r.height / 2;
  // A marker stroke as tall as the text, drawn as one rough line.
  return paths(
    generator.line(r.x - 3, y, r.x + r.width + 3, y, {
      seed,
      roughness: 0.6,
      bowing: 0.5,
      disableMultiStroke: true,
    }),
    { kind: "marker", width: r.height * 1.05 },
  );
}

function underline(r: Rect, seed: number): SketchPath[] {
  const y = r.y + r.height + 4;
  return paths(
    generator.line(r.x - 2, y, r.x + r.width + 2, y - 1, {
      seed,
      roughness: 1.1,
      bowing: 1.5,
      disableMultiStroke: true,
    }),
    { kind: "ink", width: 3.2 },
  );
}

function strike(r: Rect, seed: number): SketchPath[] {
  const y = r.y + r.height / 2;
  return paths(
    generator.line(r.x - 4, y + 2, r.x + r.width + 4, y - 2, {
      seed,
      roughness: 1.2,
      disableMultiStroke: true,
    }),
    { kind: "ink", width: 3.2 },
  );
}

function circle(r: Rect, seed: number): SketchPath[] {
  return paths(
    generator.ellipse(
      r.x + r.width / 2,
      r.y + r.height / 2,
      r.width + 26,
      r.height + 18,
      {
        seed,
        roughness: 1.3,
        disableMultiStroke: true,
      },
    ),
    { kind: "ink", width: 3 },
  );
}

function box(r: Rect, seed: number): SketchPath[] {
  return paths(
    generator.rectangle(r.x - 10, r.y - 7, r.width + 20, r.height + 14, {
      seed,
      roughness: 1.4,
      disableMultiStroke: true,
    }),
    { kind: "ink", width: 3.4 },
  );
}

function arrow(from: Rect, to: Rect, seed: number): SketchPath[] {
  const a = center(from);
  const b = center(to);
  const mid = {
    x: (a.x + b.x) / 2 + (b.y - a.y) * 0.2,
    y: (a.y + b.y) / 2 - (b.x - a.x) * 0.2,
  };
  const angle = Math.atan2(b.y - mid.y, b.x - mid.x);
  const head = (offset: number) => ({
    x: b.x - 16 * Math.cos(angle + offset),
    y: b.y - 16 * Math.sin(angle + offset),
  });
  const left = head(0.45);
  const right = head(-0.45);
  return [
    ...paths(
      generator.curve(
        [
          [a.x, a.y],
          [mid.x, mid.y],
          [b.x, b.y],
        ],
        { seed, roughness: 1, disableMultiStroke: true },
      ),
      {
        kind: "ink",
        width: 3,
      },
    ),
    ...paths(
      generator.linearPath(
        [
          [left.x, left.y],
          [b.x, b.y],
          [right.x, right.y],
        ],
        { seed, roughness: 0.8, disableMultiStroke: true },
      ),
      { kind: "ink", width: 3 },
    ),
  ];
}

/**
 * Board figure parts: outlines get a light wobble but keep their vertices,
 * fills are traced (and fade in), text is "written" along its baseline.
 */
function figurePart(part: FigurePart, seed: number): SketchPath[] {
  if (part.kind === "text") {
    const width = part.text.length * part.size * 0.6;
    const start =
      part.anchor === "start"
        ? part.x
        : part.anchor === "end"
          ? part.x - width
          : part.x - width / 2;
    return [
      {
        d: `M${start} ${part.y} L${start + width} ${part.y}`,
        kind: "text",
        width: 0,
        color: part.color,
        text: part,
      },
    ];
  }
  if (part.fill) {
    return [
      {
        d: part.d,
        kind: "fill",
        width: 0,
        color: part.color,
        solid: part.fill === "solid",
      },
    ];
  }
  return generator
    .toPaths(
      generator.path(part.d, {
        seed,
        roughness: 0.4,
        bowing: 0.4,
        preserveVertices: true,
        disableMultiStroke: true,
      }),
    )
    .map((p) => ({
      d: p.d,
      kind: "ink" as const,
      width: part.width,
      color: part.color,
    }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function paths(
  drawable: ReturnType<typeof generator.line>,
  style: Pick<SketchPath, "kind" | "width">,
): SketchPath[] {
  return generator
    .toPaths(drawable)
    .map((p) => ({ d: p.d, color: "red", ...style }));
}

function center(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SketchPath {
  d: string;
  /**
   * marker: wide translucent highlighter; ink: pen stroke; fill: a shaded
   * area that fades in while the pen traces it; text: a board label the pen
   * writes along `d`.
   */
  kind: "marker" | "ink" | "fill" | "text";
  width: number;
  color: InkColor;
  text?: Extract<FigurePart, { kind: "text" }>;
  /** fill only: an opaque dot instead of a translucent area. */
  solid?: boolean;
}
