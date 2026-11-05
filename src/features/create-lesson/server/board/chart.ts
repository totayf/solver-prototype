import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import {
  arc,
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
 * Data charts for reading-data questions: bar (grouped when there are
 * several series), line, or pie. The first draw sets the data; later draws
 * highlight a bar, point or slice (by label) and may write a note on it.
 */
export const chartSpec = z.object({
  type: z.enum(["bar", "line", "pie"]).optional(),
  labels: z.array(z.string()).optional(),
  series: z
    .array(
      z.object({
        name: z.string().optional(),
        values: z.array(z.number()),
        color: penColor.optional(),
      }),
    )
    .optional(),
  unit: z.string().optional(),
  highlight: z
    .array(
      z.object({
        label: z.string(),
        series: z.number().int().min(0).optional(),
        note: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
});

type ChartSpec = z.infer<typeof chartSpec>;

export function renderChart(specs: ChartSpec[]): FigureRender {
  const { type, labels, series, unit = "" } = specs[0];
  if (!type || !labels?.length || !series?.length) {
    throw new FigureError(
      'the first chart draw must set "type", "labels" and "series"',
    );
  }
  for (const s of series) {
    if (s.values.length !== labels.length) {
      throw new FigureError(
        `series "${s.name ?? ""}" has ${s.values.length} values for ${labels.length} labels`,
      );
    }
  }
  const chart =
    type === "pie"
      ? pieChart(labels, series[0].values, unit)
      : axisChart(type, labels, series, unit);

  const parts = specs.map((spec, index): FigurePart[] => [
    ...(index === 0 ? chart.base : []),
    ...spec.highlight.flatMap((h) => {
      const i = labels.indexOf(h.label);
      if (i === -1)
        throw new FigureError(
          `no label "${h.label}" in the chart; labels are ${labels.join(", ")}`,
        );
      return chart.highlight(i, h.series ?? 0, h.color ?? "red", h.note);
    }),
  ]);
  return { height: chart.height, parts };
}

// ── Charts ───────────────────────────────────────────────────────────────────

interface Chart {
  height: number;
  base: FigurePart[];
  highlight: (
    index: number,
    series: number,
    color: FigurePart["color"],
    note?: string,
  ) => FigurePart[];
}

function axisChart(
  type: "bar" | "line",
  labels: string[],
  series: NonNullable<ChartSpec["series"]>,
  unit: string,
): Chart {
  const height = 560;
  const left = 110;
  const right = FIGURE_WIDTH - 40;
  const top = 60;
  const bottom = height - 80;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const slot = (right - left) / labels.length;
  const barWidth = (slot * 0.7) / (type === "bar" ? series.length : 1);
  const xOf = (i: number, s: number) =>
    type === "bar"
      ? left + slot * i + slot * 0.15 + barWidth * (s + 0.5)
      : left + slot * (i + 0.5);

  const base: FigurePart[] = [];
  const step = max / 5;
  const ticks: string[] = [];
  for (let k = 0; k <= 5; k++) {
    const v = step * k;
    ticks.push(line({ x: left - 8, y: y(v) }, { x: left, y: y(v) }));
    base.push(
      text(left - 14, y(v) + 8, format(v), { size: 22, anchor: "end" }),
    );
  }
  const axisTop = { x: left, y: top - 30 };
  base.push(
    path(
      [
        line({ x: left, y: bottom }, axisTop),
        arrowHead({ x: left, y: bottom }, axisTop, 16),
        line({ x: left, y: bottom }, { x: right, y: bottom }),
        ...ticks,
      ].join(" "),
      { width: 3 },
    ),
  );
  if (unit)
    base.push(text(left + 10, top - 20, unit, { size: 22, anchor: "start" }));
  labels.forEach((label, i) => {
    base.push(text(left + slot * (i + 0.5), bottom + 34, label, { size: 22 }));
  });

  series.forEach((s, si) => {
    const color =
      s.color ??
      (series.length > 1 ? SERIES_COLORS[si % SERIES_COLORS.length] : "ink");
    if (type === "bar") {
      s.values.forEach((v, i) => {
        const x = xOf(i, si);
        base.push(
          path(rect(x - barWidth / 2, y(v), barWidth, bottom - y(v)), {
            color,
            width: 2.5,
          }),
        );
        base.push(text(x, y(v) - 10, format(v), { color, size: 20 }));
      });
    } else {
      const pts = s.values.map((v, i) => ({ x: xOf(i, si), y: y(v) }));
      base.push(path(polyline(pts), { color, width: 3.5 }));
      pts.forEach((p, i) => {
        base.push(path(circle(p, 6), { color, fill: "solid" }));
        base.push(
          text(p.x, p.y - 14, format(s.values[i]), { color, size: 20 }),
        );
      });
    }
    if (series.length > 1 && s.name) {
      base.push(
        text(right - 10, top + 28 * si, `▬ ${s.name}`, {
          color,
          size: 22,
          anchor: "end",
        }),
      );
    }
  });

  return {
    height,
    base,
    highlight: (i, si, color, note) => {
      const v = series[si]?.values[i];
      if (v === undefined)
        throw new FigureError(`no series ${si} in the chart`);
      const x = xOf(i, type === "bar" ? si : 0);
      const shape =
        type === "bar"
          ? path(rect(x - barWidth / 2, y(v), barWidth, bottom - y(v)), {
              color,
              fill: "shade",
            })
          : path(circle({ x, y: y(v) }, 13), { color, width: 4 });
      return [
        shape,
        ...(note ? [text(x, y(v) - 40, note, { color, size: 24 })] : []),
      ];
    },
  };
}

function pieChart(labels: string[], values: number[], unit: string): Chart {
  const height = 560;
  const c = { x: FIGURE_WIDTH / 2, y: height / 2 };
  const r = 200;
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0)
    throw new FigureError("pie values must add up to more than 0");
  const angles: Array<[number, number]> = [];
  let start = -Math.PI / 2;
  for (const v of values) {
    const delta = (v / total) * 2 * Math.PI;
    angles.push([start, delta]);
    start += delta;
  }
  const edge = (t: number, k = 1): Pt => ({
    x: c.x + r * k * Math.cos(t),
    y: c.y + r * k * Math.sin(t),
  });
  const slice = (i: number) => {
    const [a, d] = angles[i];
    return `M${c.x} ${c.y} L${edge(a).x} ${edge(a).y} ${arc(c, r, a, d).replace(/^M[^A]*/, "")} Z`;
  };

  const base: FigurePart[] = [path(circle(c, r), { width: 3.5 })];
  angles.forEach(([a, d], i) => {
    base.push(path(line(c, edge(a)), { width: 3 }));
    const mid = edge(a + d / 2, 1.22);
    const share = unit
      ? `${format(values[i])}${unit}`
      : `%${format((values[i] / total) * 100)}`;
    base.push(text(mid.x, mid.y, labels[i], { size: 24 }));
    base.push(text(mid.x, mid.y + 26, share, { color: "blue", size: 22 }));
  });
  return {
    height,
    base,
    highlight: (i, _s, color, note) => [
      path(slice(i), { color, fill: "shade" }),
      ...(note
        ? [
            text(
              edge(angles[i][0] + angles[i][1] / 2, 0.55).x,
              edge(angles[i][0] + angles[i][1] / 2, 0.55).y,
              note,
              { color, size: 24 },
            ),
          ]
        : []),
    ],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rect(x: number, y: number, w: number, h: number): string {
  return polyline(
    [
      { x, y: y + h },
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
    ],
    true,
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

function format(v: number): string {
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace("-", "−");
}

const SERIES_COLORS = ["blue", "red", "green", "purple", "orange"] as const;
