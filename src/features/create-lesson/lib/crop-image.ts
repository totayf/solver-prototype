import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Pixel size of the photo as the manipulator sees it (rotation baked in). */
export async function imageSize(
  uri: string,
): Promise<{ width: number; height: number }> {
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  return { width: rendered.width, height: rendered.height };
}

/** Cuts `rect` (photo pixels) out of the photo; returns the new file's uri. */
export async function cropImage(uri: string, rect: PixelRect): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri)
    .crop({
      originX: Math.round(rect.x),
      originY: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
    .renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.95,
  });
  return saved.uri;
}

/** Turns the photo a quarter clockwise, for questions shot sideways. */
export async function rotateImage(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri)
    .rotate(90)
    .renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.95,
  });
  return saved.uri;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
