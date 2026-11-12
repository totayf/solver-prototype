/**
 * Pure geometry for preparing the question photo: crop rectangles snapped to
 * whole pixels inside the image, and resize targets that cap the long edge.
 */

/**
 * The crop in whole image pixels: edges rounded outward (floor/ceil) so no
 * part of the framed question is lost, then clamped to the image. Never
 * empty; a missing or broken rect means the whole image.
 */
export function clampCropRect(
  rect: PixelRect | undefined,
  size: Size,
): PixelRect {
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  if (
    !rect ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
  ) {
    return { x: 0, y: 0, width, height };
  }
  const left = clamp(Math.floor(rect.x), 0, width - 1);
  const top = clamp(Math.floor(rect.y), 0, height - 1);
  const right = clamp(Math.ceil(rect.x + rect.width), left + 1, width);
  const bottom = clamp(Math.ceil(rect.y + rect.height), top + 1, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** True when the crop keeps the whole image (the crop step can be skipped). */
export function coversImage(rect: PixelRect, size: Size): boolean {
  return (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width >= Math.floor(size.width) &&
    rect.height >= Math.floor(size.height)
  );
}

/** Resize argument that brings the long edge down to `maxEdge`, or null if it already fits. */
export function downscaleTarget(
  size: Size,
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (Math.max(size.width, size.height) <= maxEdge) return null;
  return size.width >= size.height ? { width: maxEdge } : { height: maxEdge };
}

/** Identifies one prepared upload: the same photo and crop give the same bytes. */
export function uploadKey(uri: string, rect: PixelRect): string {
  return `${uri}#${rect.x},${rect.y},${rect.width},${rect.height}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A picked photo, already downscaled, with its pixel size (rotation baked in). */
export interface QuestionImage extends Size {
  uri: string;
}
