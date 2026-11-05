import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Bakes in the photo's rotation and shrinks it to a size that keeps text
 * sharp for OCR without uploading megabytes. Returns base64 JPEG.
 */
export async function prepareImage(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const longEdge = Math.max(original.width, original.height);

  const context = ImageManipulator.manipulate(uri);
  if (longEdge > MAX_EDGE) {
    context.resize(
      original.width >= original.height
        ? { width: MAX_EDGE }
        : { height: MAX_EDGE },
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
