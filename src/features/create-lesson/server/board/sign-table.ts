import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  FIGURE_WIDTH,
  FigureError,
  type FigureRender,
  line,
  path,
  text,
} from "./svg";

/**
 * Sign table (işaret tablosu): the header lists −∞, the roots and +∞; each row
 * gives one sign per interval and, optionally, what happens at each root
 * ("0" by default, "∄" for undefined). Later draws append rows.
 */
export const signTableSpec = z.object({
  variable: z.string().optional(),
  roots: z.array(z.string()).max(6).optional(),
  rows: z
    .array(
      z.object({
        label: z.string(),
        signs: z.array(z.enum(["+", "-", "−"])),
        atRoots: z.array(z.string()).optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

export function renderSignTable(
  specs: z.infer<typeof signTableSpec>[],
): FigureRender {
  const { roots, variable = "x" } = specs[0];
  if (!roots)
    throw new FigureError(
      'the first signTable draw must set "roots" (as text, in increasing order)',
    );
  const totalRows = specs.reduce((sum, spec) => sum + spec.rows.length, 0);
  const height = PAD * 2 + ROW * (totalRows + 1);
  const columns = roots.length + 2;
  const start = LABEL + 30;
  const end = FIGURE_WIDTH - PAD - 40;
  const columnX = (i: number) => start + ((end - start) * i) / (columns - 1);
  const intervalX = (i: number) => (columnX(i) + columnX(i + 1)) / 2;

  let rowIndex = 0;
  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      const header = [
        line({ x: PAD, y: PAD + ROW }, { x: FIGURE_WIDTH - PAD, y: PAD + ROW }),
        line({ x: LABEL - 20, y: PAD }, { x: LABEL - 20, y: height - PAD }),
      ].join(" ");
      out.push(
        path(header, { width: 3 }),
        text(PAD + 20, PAD + ROW / 2 + 11, variable, {
          size: 30,
          anchor: "start",
        }),
      );
      ["−∞", ...roots, "+∞"].forEach((value, i) => {
        out.push(text(columnX(i), PAD + ROW / 2 + 11, value, { size: 28 }));
      });
    }
    for (const row of spec.rows) {
      if (row.signs.length !== roots.length + 1) {
        throw new FigureError(
          `row "${row.label}" needs ${roots.length + 1} signs (one per interval), got ${row.signs.length}`,
        );
      }
      const y = PAD + ROW * (rowIndex + 1.5) + 11;
      const color = row.color ?? "red";
      out.push(text(PAD + 20, y, row.label, { size: 28, anchor: "start" }));
      row.signs.forEach((sign, i) => {
        out.push(
          text(intervalX(i), y + 2, sign === "+" ? "+" : "−", {
            color,
            size: 38,
          }),
        );
      });
      roots.forEach((_, i) => {
        const mark = row.atRoots?.[i] ?? "0";
        if (mark) out.push(text(columnX(i + 1), y, mark, { size: 26 }));
      });
      rowIndex += 1;
    }
    return out;
  });
  return { height, parts };
}

const PAD = 24;
const ROW = 70;
const LABEL = 250;
