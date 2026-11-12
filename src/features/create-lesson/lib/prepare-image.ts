import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { withImageErrors } from "./crop-image";
import {
  clampCropRect,
  coversImage,
  downscaleTarget,
  type PixelRect,
  type QuestionImage,
} from "./crop-rect";

/**
 * Cuts the question out of the working copy (crop snapped to whole pixels
 * inside the image) and shrinks it to a size that keeps text sharp for OCR
 * without uploading megabytes, in one decode and one encode. Returns base64
 * JPEG; any failure is a friendly "Fotoğraf hazırlanamadı".
 */
export function prepareImage(
  image: QuestionImage,
  crop?: PixelRect,
): Promise<string> {
  return withImageErrors(async () => {
    const rect = clampCropRect(crop, image);
    const context = ImageManipulator.manipulate(image.uri);
    try {
      if (!coversImage(rect, image)) {
        context.crop({
          originX: rect.x,
          originY: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
      const target = downscaleTarget(rect, UPLOAD_MAX_EDGE);
      if (target) context.resize(target);
      const rendered = await context.renderAsync();
      try {
        const saved = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.85,
          base64: true,
        });
        if (!saved.base64) throw new Error("no base64 from the manipulator");
        return saved.base64;
      } finally {
        rendered.release();
      }
    } finally {
      context.release();
    }
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_MAX_EDGE = 1600;
