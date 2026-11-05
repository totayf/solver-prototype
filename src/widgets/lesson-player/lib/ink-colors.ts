import type { InkColor } from "@/entities/lesson";

/** Pen colors on screen. Highlights always use the yellow marker instead. */
const INK_HEX: Record<InkColor, string> = {
  red: "#E5292F",
  blue: "#2563EB",
  green: "#16A34A",
  purple: "#9333EA",
  orange: "#EA580C",
  ink: "#27272A",
};

/** Hex for a pen color; anything unknown (older lessons) draws in red. */
export function inkHex(color: string): string {
  return INK_HEX[color as InkColor] ?? INK_HEX.red;
}
