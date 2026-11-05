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
 * A grid: the first draw sets the column headers, every draw may append rows
 * or fill single cells (row/col are 0-based over the data rows). Punnett
 * squares are a table whose first column holds the row gametes.
 */
export const tableSpec = z.object({
  columns: z.array(z.string()).min(1).max(8).optional(),
  rows: z.array(z.array(z.string())).default([]),
  cells: z
    .array(
      z.object({
        row: z.number().int().min(0),
        col: z.number().int().min(0),
        text: z.string(),
      }),
    )
    .default([]),
  color: penColor.optional(),
});

export function renderTable(specs: z.infer<typeof tableSpec>[]): FigureRender {
  const columns = specs[0].columns;
  if (!columns)
    throw new FigureError(
      'the first table draw must set "columns" (header texts, "" for an empty corner)',
    );
  const totalRows = specs.reduce((sum, spec) => sum + spec.rows.length, 0);
  const width = (FIGURE_WIDTH - 2 * PAD) / columns.length;
  const height = PAD * 2 + ROW * (totalRows + 1);
  const cellCenter = (row: number, col: number) => ({
    x: PAD + width * (col + 0.5),
    y: PAD + ROW * (row + 1.5) + 11,
  });

  let rowCount = 0;
  const parts = specs.map((spec, index): FigurePart[] => {
    const out: FigurePart[] = [];
    if (index === 0) {
      const verticals = Array.from({ length: columns.length + 1 }, (_, c) =>
        line(
          { x: PAD + width * c, y: PAD },
          { x: PAD + width * c, y: height - PAD },
        ),
      );
      const top = line({ x: PAD, y: PAD }, { x: FIGURE_WIDTH - PAD, y: PAD });
      const headerLine = line(
        { x: PAD, y: PAD + ROW },
        { x: FIGURE_WIDTH - PAD, y: PAD + ROW },
      );
      out.push(path([top, ...verticals, headerLine].join(" "), { width: 3 }));
      columns.forEach((header, c) => {
        if (header)
          out.push(
            text(PAD + width * (c + 0.5), PAD + ROW / 2 + 11, header, {
              size: 30,
            }),
          );
      });
    }
    for (const row of spec.rows) {
      if (row.length > columns.length)
        throw new FigureError(
          `row ${JSON.stringify(row)} has more cells than the ${columns.length} columns`,
        );
      const bottom = PAD + ROW * (rowCount + 2);
      out.push(
        path(
          line({ x: PAD, y: bottom }, { x: FIGURE_WIDTH - PAD, y: bottom }),
          { width: 3 },
        ),
      );
      row.forEach((cell, c) => {
        const p = cellCenter(rowCount, c);
        if (cell)
          out.push(
            text(p.x, p.y, cell, {
              color: c === 0 ? "ink" : (spec.color ?? "ink"),
              size: 30,
            }),
          );
      });
      rowCount += 1;
    }
    for (const cell of spec.cells) {
      if (cell.row >= totalRows || cell.col >= columns.length) {
        throw new FigureError(
          `cell (${cell.row}, ${cell.col}) is outside the ${totalRows}×${columns.length} table`,
        );
      }
      const p = cellCenter(cell.row, cell.col);
      out.push(
        text(p.x, p.y, cell.text, { color: spec.color ?? "red", size: 30 }),
      );
    }
    return out;
  });
  return { height, parts };
}

const PAD = 30;
const ROW = 72;
