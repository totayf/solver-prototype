import type { Rect } from "@/entities/lesson";

import { boundingBox } from "./sketch";

/**
 * Where to put the question image inside the viewport: the whole question,
 * fitted ("contain"), unless the teacher explicitly zooms in with `focus`. Edges are clamped so zooming never reveals empty space.
 */
export function cameraFor({
  viewport,
  image,
  focus,
}: {
  viewport: Size;
  image: Size;
  focus: Rect[] | null;
}): Camera {
  const fit = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const width = image.width * fit;
  const height = image.height * fit;

  if (!focus || focus.length === 0) {
    return {
      left: (viewport.width - width) / 2,
      top: (viewport.height - height) / 2,
      width,
      height,
      scale: 1,
    };
  }

  const target = pad(boundingBox(focus), image);
  const scale = clamp(
    Math.min(
      viewport.width / (target.width * fit),
      viewport.height / (target.height * fit),
    ) * 0.9,
    1,
    MAX_ZOOM,
  );
  const cx = (target.x + target.width / 2) * fit * scale;
  const cy = (target.y + target.height / 2) * fit * scale;

  return {
    left: settle(viewport.width / 2 - cx, viewport.width, width * scale),
    top: settle(viewport.height / 2 - cy, viewport.height, height * scale),
    width,
    height,
    scale,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ZOOM = 2.4;
const FOCUS_PADDING = 24;

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(r: Rect, image: Size): Rect {
  const x = Math.max(0, r.x - FOCUS_PADDING);
  const y = Math.max(0, r.y - FOCUS_PADDING);
  return {
    x,
    y,
    width: Math.min(image.width, r.x + r.width + FOCUS_PADDING) - x,
    height: Math.min(image.height, r.y + r.height + FOCUS_PADDING) - y,
  };
}

/** Center content smaller than the viewport; keep larger content edge-to-edge. */
function settle(offset: number, viewport: number, content: number): number {
  if (content <= viewport) return (viewport - content) / 2;
  return clamp(offset, viewport - content, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Size {
  width: number;
  height: number;
}

/** Image box at zoom 1 (left/top/width/height) plus the zoom applied from its top-left. */
export interface Camera {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}
