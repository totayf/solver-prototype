import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { UserFacingError } from "@/shared/api/request-json";

import { downscaleTarget, type QuestionImage, type Size } from "./crop-rect";

/**
 * Makes the working copy of a picked photo: decoded once and, when larger,
 * shrunk to a 2400 px long edge — every later step (rotate, crop, encode)
 * works on this copy instead of a 12 MP original. The size comes from the
 * picker; it is only measured when the picker didn't report one.
 */
export async function workingCopy(
  uri: string,
  reported?: Partial<Size>,
): Promise<QuestionImage> {
  return withImageErrors(async () => {
    const size =
      reported?.width && reported.height
        ? { width: reported.width, height: reported.height }
        : await measure(uri);
    const target = downscaleTarget(size, WORKING_MAX_EDGE);
    if (!target) return { uri, ...size };
    return render(uri, (context) => context.resize(target), WORKING_QUALITY);
  });
}

/** Turns the photo a quarter clockwise, for questions shot sideways. */
export function rotateImage(image: QuestionImage): Promise<QuestionImage> {
  return withImageErrors(() =>
    render(image.uri, (context) => context.rotate(90), WORKING_QUALITY),
  );
}

/** Any manipulator failure reads the same to the student. */
export async function withImageErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof UserFacingError) throw cause;
    throw new UserFacingError(IMAGE_FAILED, "image", { cause });
  }
}

export const IMAGE_FAILED = "Fotoğraf hazırlanamadı, tekrar dene.";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function measure(uri: string): Promise<Size> {
  const context = ImageManipulator.manipulate(uri);
  const rendered = await context.renderAsync();
  const size = { width: rendered.width, height: rendered.height };
  rendered.release();
  context.release();
  return size;
}

/** One decode, the given transforms, one JPEG encode; native memory is freed at once. */
async function render(
  uri: string,
  transform: (
    context: ReturnType<typeof ImageManipulator.manipulate>,
  ) => unknown,
  compress: number,
): Promise<QuestionImage> {
  const context = ImageManipulator.manipulate(uri);
  try {
    transform(context);
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress,
      });
      return { uri: saved.uri, width: saved.width, height: saved.height };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Plenty for framing and OCR after the crop; the upload is shrunk again. */
const WORKING_MAX_EDGE = 2400;
const WORKING_QUALITY = 0.92;
