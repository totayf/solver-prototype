import { z } from "zod";

import type { FigureLayout, FigurePart } from "@/entities/lesson";

import { chartSpec, renderChart } from "./chart";
import { circuitSpec, renderCircuit } from "./circuit";
import { constructSpec, renderConstruct } from "./construct";
import { forcesSpec, renderForces } from "./forces";
import { mapSpec, renderMap } from "./map";
import { motionSpec, renderMotion } from "./motion";
import { numberLineSpec, renderNumberLine } from "./number-line";
import { plotSpec, renderPlot } from "./plot";
import { renderSignTable, signTableSpec } from "./sign-table";
import { renderSolid, solidSpec } from "./solid";
import { FigureError, type FigureRender } from "./svg";
import { renderTable, tableSpec } from "./table";
import { renderTimeline, timelineSpec } from "./timeline";
import { renderTree, treeSpec } from "./tree";
import { renderVenn, vennSpec } from "./venn";

const RENDERERS = {
  construct: renderer(constructSpec, renderConstruct),
  plot: renderer(plotSpec, renderPlot),
  table: renderer(tableSpec, renderTable),
  numberLine: renderer(numberLineSpec, renderNumberLine),
  signTable: renderer(signTableSpec, renderSignTable),
  venn: renderer(vennSpec, renderVenn),
  motion: renderer(motionSpec, renderMotion),
  forces: renderer(forcesSpec, renderForces),
  timeline: renderer(timelineSpec, renderTimeline),
  solid: renderer(solidSpec, renderSolid),
  tree: renderer(treeSpec, renderTree),
  chart: renderer(chartSpec, renderChart),
  map: renderer(mapSpec, renderMap),
  circuit: renderer(circuitSpec, renderCircuit),
};

export type FigureKind = keyof typeof RENDERERS;
export const FIGURE_KINDS = Object.keys(RENDERERS) as [
  FigureKind,
  ...FigureKind[],
];

/** One `draw` action from the script, keyed so the parts can be found again. */
export interface DrawRequest {
  key: string;
  figure: string;
  kind: FigureKind;
  spec: string;
}

/**
 * Renders every board figure of a lesson. Draws with the same figure id build
 * one figure step by step; a figure with any bad draw is dropped whole and its
 * errors are returned (they go back to the model in the repair loop).
 */
export function renderFigures(draws: DrawRequest[]): {
  layouts: FigureLayout[];
  parts: Map<string, FigurePart[]>;
  errors: string[];
} {
  const groups = new Map<string, DrawRequest[]>();
  for (const draw of draws)
    groups.set(draw.figure, [...(groups.get(draw.figure) ?? []), draw]);

  const layouts: FigureLayout[] = [];
  const parts = new Map<string, FigurePart[]>();
  const errors: string[] = [];

  for (const [figure, group] of groups) {
    const kind = group[0].kind;
    const mixed = group.find((draw) => draw.kind !== kind);
    if (mixed) {
      errors.push(
        `${mixed.key} figure "${figure}": kind "${mixed.kind}" differs from its first draw ("${kind}"); use a new figure id`,
      );
      continue;
    }
    const result = renderGroup(RENDERERS[kind], group);
    if ("error" in result) {
      errors.push(`figure "${figure}" (${kind}): ${result.error}`);
      continue;
    }
    layouts.push({ id: figure, kind, height: Math.round(result.height) });
    group.forEach((draw, i) => parts.set(draw.key, result.parts[i]));
  }
  return { layouts, parts, errors };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Renderer {
  parse: (
    json: unknown,
  ) => { ok: true; value: unknown } | { ok: false; error: string };
  render: (specs: unknown[]) => FigureRender;
}

function renderer<S extends z.ZodType>(
  schema: S,
  render: (specs: z.infer<S>[]) => FigureRender,
): Renderer {
  return {
    parse: (json) => {
      const result = schema.safeParse(json);
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, error: z.prettifyError(result.error) };
    },
    render: (specs) => render(specs as z.infer<S>[]),
  };
}

function renderGroup(
  kind: Renderer,
  group: DrawRequest[],
): FigureRender | { error: string } {
  const specs: unknown[] = [];
  for (const draw of group) {
    let json: unknown;
    try {
      json = JSON.parse(draw.spec);
    } catch {
      return { error: `${draw.key}: spec is not valid JSON` };
    }
    const parsed = kind.parse(json);
    if (!parsed.ok)
      return { error: `${draw.key}: ${parsed.error.replaceAll("\n", " ")}` };
    specs.push(parsed.value);
  }
  try {
    return kind.render(specs);
  } catch (error) {
    if (error instanceof FigureError) return { error: error.message };
    return {
      error: `cannot draw (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}
