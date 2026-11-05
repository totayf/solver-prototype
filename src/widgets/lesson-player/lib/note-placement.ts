import type { NoteSide, Rect } from "@/entities/lesson";

/**
 * CSS position for a handwritten note next to its anchor word, in percent of
 * the image so it scales with zoom. `auto` prefers the right margin and falls
 * back to below the word when the word is already near the right edge.
 */
export function notePlacement(
  anchor: Rect,
  side: NoteSide,
  image: { width: number; height: number },
): NotePlacement {
  const resolved = side === "auto" ? autoSide(anchor, image) : side;
  const left = {
    start: anchor.x,
    center: anchor.x + anchor.width / 2,
    end: anchor.x + anchor.width,
  };
  const top = {
    start: anchor.y,
    center: anchor.y + anchor.height / 2,
    end: anchor.y + anchor.height,
  };

  const [x, shiftX] = resolved.includes("left")
    ? [left.start - GAP, "-100%"]
    : resolved.includes("right")
      ? [left.end + GAP, "0%"]
      : [left.center, "-50%"];
  const [y, shiftY] = resolved.startsWith("top")
    ? [top.start - GAP, "-100%"]
    : resolved.startsWith("bottom")
      ? [top.end + GAP, "0%"]
      : [top.center, "-50%"];

  return {
    left: `${(x / image.width) * 100}%`,
    top: `${(y / image.height) * 100}%`,
    transform: `translate(${shiftX}, ${shiftY})`,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const GAP = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function autoSide(anchor: Rect, image: { width: number }): NoteSide {
  return anchor.x + anchor.width < image.width * 0.7 ? "right" : "bottom";
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotePlacement {
  left: string;
  top: string;
  transform: string;
}
