import type { FigurePart, InkColor } from "@/entities/lesson";

/** Every board figure is this wide; heights vary. Units are SVG user units. */
export const FIGURE_WIDTH = 1000;

/** A spec the model wrote that can't be drawn; the message goes back to the model. */
export class FigureError extends Error {}

export function path(
  d: string,
  { color = "ink", width = 4, fill }: PathStyle = {},
): FigurePart {
  return { kind: "path", d, color, width, ...(fill ? { fill } : {}) };
}

export function text(
  x: number,
  y: number,
  value: string,
  { color = "ink", size = 34, anchor = "middle" }: TextStyle = {},
): FigurePart {
  return { kind: "text", x: r(x), y: r(y), text: value, color, size, anchor };
}

export function line(a: Pt, b: Pt): string {
  return `M${r(a.x)} ${r(a.y)} L${r(b.x)} ${r(b.y)}`;
}

/** A dashed line as separate dashes, so the pen draws each one. */
export function dashedLine(a: Pt, b: Pt, dash = 18, gap = 12): string {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return "";
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const parts: string[] = [];
  for (let s = 0; s < length; s += dash + gap) {
    const e = Math.min(s + dash, length);
    parts.push(
      line(
        { x: a.x + ux * s, y: a.y + uy * s },
        { x: a.x + ux * e, y: a.y + uy * e },
      ),
    );
  }
  return parts.join(" ");
}

export function polyline(points: Pt[], closed = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M${r(first.x)} ${r(first.y)} ${rest.map((p) => `L${r(p.x)} ${r(p.y)}`).join(" ")}${closed ? " Z" : ""}`;
}

export function circle(c: Pt, radius: number): string {
  return `M${r(c.x + radius)} ${r(c.y)} A${r(radius)} ${r(radius)} 0 1 1 ${r(c.x - radius)} ${r(c.y)} A${r(radius)} ${r(radius)} 0 1 1 ${r(c.x + radius)} ${r(c.y)}`;
}

/** Arc around `c` from angle `start` sweeping `delta` radians (SVG y-down angles). */
export function arc(
  c: Pt,
  radius: number,
  start: number,
  delta: number,
): string {
  const a = {
    x: c.x + radius * Math.cos(start),
    y: c.y + radius * Math.sin(start),
  };
  const b = {
    x: c.x + radius * Math.cos(start + delta),
    y: c.y + radius * Math.sin(start + delta),
  };
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M${r(a.x)} ${r(a.y)} A${r(radius)} ${r(radius)} 0 ${large} ${sweep} ${r(b.x)} ${r(b.y)}`;
}

/** Two short strokes forming an arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(from: Pt, tip: Pt, size = 22): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const wing = (offset: number) => ({
    x: tip.x - size * Math.cos(angle + offset),
    y: tip.y - size * Math.sin(angle + offset),
  });
  return `${line(wing(0.45), tip)} ${line(tip, wing(-0.45))}`;
}

export function arrow(from: Pt, tip: Pt, size = 22): string {
  return `${line(from, tip)} ${arrowHead(from, tip, size)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to 0.1 units — plenty for drawing, keeps lesson JSON small. */
function r(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

interface PathStyle {
  color?: InkColor;
  width?: number;
  /** solid for dots, shade for translucent areas; omitted for outlines. */
  fill?: "solid" | "shade";
}

interface TextStyle {
  color?: InkColor;
  size?: number;
  anchor?: "start" | "middle" | "end";
}

/** What every figure renderer returns: final height and the parts each spec adds. */
export interface FigureRender {
  height: number;
  parts: FigurePart[][];
}
