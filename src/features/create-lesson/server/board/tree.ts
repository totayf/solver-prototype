import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  circle,
  FIGURE_WIDTH,
  FigureError,
  type FigureRender,
  line,
  type Pt,
  path,
  text,
} from "./svg";

/**
 * Probability / counting tree, drawn left to right: each branch carries its
 * probability on the edge and its outcome at the node; leaves may show a
 * result (e.g. the path's product). Later draws highlight paths, given as
 * the branch labels from the root ("K", "B").
 */
interface Branch {
  label: string;
  p?: string;
  result?: string;
  children?: Branch[];
}

const branch: z.ZodType<Branch> = z.lazy(() =>
  z.object({
    label: z.string(),
    p: z.string().optional(),
    result: z.string().optional(),
    children: z.array(branch).optional(),
  }),
);

export const treeSpec = z.object({
  root: z.string().optional(),
  branches: z.array(branch).optional(),
  highlight: z
    .array(
      z.object({
        path: z.array(z.string()).min(1),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderTree(specs: z.infer<typeof treeSpec>[]): FigureRender {
  const branches = specs[0].branches;
  if (!branches?.length) {
    throw new FigureError('the first tree draw must set "branches"');
  }
  const depth = maxDepth(branches);
  const leaves = countLeaves(branches);
  if (depth > 4 || leaves > 12) {
    throw new FigureError(
      "a tree holds at most 4 levels and 12 leaves; show the part that matters",
    );
  }

  const height = Math.max(260, leaves * ROW + 2 * PAD);
  const columnWidth = (FIGURE_WIDTH - 2 * PAD - RESULT_WIDTH) / depth;
  const nodes = new Map<string, Pt>();
  let nextLeaf = 0;

  // Leaves get evenly spaced rows; a parent sits midway between its children.
  const place = (list: Branch[], level: number, prefix: string): number[] =>
    list.map((b) => {
      const key = `${prefix}/${b.label}`;
      const x = PAD + columnWidth * (level + 1);
      let y: number;
      if (b.children?.length) {
        const ys = place(b.children, level + 1, key);
        y = (Math.min(...ys) + Math.max(...ys)) / 2;
      } else {
        y = PAD + ROW * (nextLeaf + 0.5);
        nextLeaf += 1;
      }
      nodes.set(key, { x, y });
      return y;
    });
  const rootYs = place(branches, 0, "");
  const root = { x: PAD, y: (Math.min(...rootYs) + Math.max(...rootYs)) / 2 };

  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      out.push(path(circle(root, 6), { fill: "solid" }));
      if (specs[0].root) {
        out.push(text(root.x, root.y - 20, specs[0].root, { size: 26 }));
      }
      const drawBranches = (list: Branch[], from: Pt, prefix: string) => {
        for (const b of list) {
          const key = `${prefix}/${b.label}`;
          const to = nodes.get(key) as Pt;
          out.push(path(line(from, to), { width: 3 }));
          if (b.p) {
            // Upper branches carry their label above the edge, lower ones below.
            const below = to.y > from.y + 1;
            const at = {
              x: from.x + (to.x - from.x) * 0.45,
              y: from.y + (to.y - from.y) * 0.45,
            };
            out.push(
              text(at.x, at.y + (below ? 30 : -12), b.p, {
                color: "blue",
                size: 24,
              }),
            );
          }
          out.push(path(circle(to, 5), { fill: "solid" }));
          out.push(
            text(to.x + 12, to.y - 12, b.label, { size: 28, anchor: "start" }),
          );
          if (b.result) {
            out.push(
              text(FIGURE_WIDTH - PAD, to.y + 9, b.result, {
                color: "red",
                size: 26,
                anchor: "end",
              }),
            );
          }
          if (b.children) drawBranches(b.children, to, key);
        }
      };
      drawBranches(branches, root, "");
    }
    for (const h of spec.highlight) {
      const color = h.color ?? "red";
      let from = root;
      let key = "";
      const strokes: string[] = [];
      for (const label of h.path) {
        key = `${key}/${label}`;
        const to = nodes.get(key);
        if (!to) {
          throw new FigureError(
            `highlight path ${JSON.stringify(h.path)}: no branch "${label}" there`,
          );
        }
        strokes.push(line(from, to));
        from = to;
      }
      out.push(path(strokes.join(" "), { color, width: 7 }));
    }
    return out;
  });
  return { height, parts };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maxDepth(list: Branch[]): number {
  return (
    1 +
    Math.max(
      0,
      ...list.map((b) => (b.children?.length ? maxDepth(b.children) : 0)),
    )
  );
}

function countLeaves(list: Branch[]): number {
  return list.reduce(
    (s, b) => s + (b.children?.length ? countLeaves(b.children) : 1),
    0,
  );
}

const PAD = 50;
const ROW = 56;
const RESULT_WIDTH = 150;
