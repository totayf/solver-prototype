import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { PixelRect } from "./crop-image";

/**
 * Cuts the question out of the photo (when a crop is given), bakes in its
 * rotation and shrinks it to a size that keeps text sharp for OCR without
 * uploading megabytes, in one decode and one encode. Returns base64 JPEG.
 */
export async function prepareImage(
  uri: string,
  crop?: PixelRect,
): Promise<string> {
  const size = crop ?? (await ImageManipulator.manipulate(uri).renderAsync());
  const width = Math.round(size.width);
  const height = Math.round(size.height);

  const context = ImageManipulator.manipulate(uri);
  if (crop) {
    context.crop({
      originX: Math.round(crop.x),
      originY: Math.round(crop.y),
      width,
      height,
    });
  }
  if (Math.max(width, height) > MAX_EDGE) {
    context.resize(
      width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE },
    );
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.85,
    base64: true,
  });

  if (!saved.base64) throw new Error("Fotoğraf hazırlanamadı.");
  return saved.base64;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_EDGE = 1600;
