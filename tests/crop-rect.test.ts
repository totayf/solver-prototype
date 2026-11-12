import { describe, expect, test } from "bun:test";

import {
  clampCropRect,
  coversImage,
  downscaleTarget,
  uploadKey,
} from "../src/features/create-lesson/lib/crop-rect";

const image = { width: 2400, height: 1800 };

describe("clampCropRect", () => {
  test("rounds edges outward to whole pixels", () => {
    expect(
      clampCropRect({ x: 10.7, y: 20.2, width: 100.1, height: 50.5 }, image),
    ).toEqual({ x: 10, y: 20, width: 101, height: 51 });
  });

  test("keeps the crop inside the image", () => {
    expect(
      clampCropRect({ x: -5, y: -3, width: 3000, height: 2000 }, image),
    ).toEqual({ x: 0, y: 0, width: 2400, height: 1800 });
    expect(
      clampCropRect({ x: 2399.6, y: 1799.9, width: 50, height: 50 }, image),
    ).toEqual({ x: 2399, y: 1799, width: 1, height: 1 });
  });

  test("never empty; missing or broken rects mean the whole image", () => {
    expect(clampCropRect({ x: 50, y: 50, width: 0, height: 0 }, image)).toEqual(
      { x: 50, y: 50, width: 1, height: 1 },
    );
    expect(clampCropRect(undefined, image)).toEqual({
      x: 0,
      y: 0,
      ...image,
    });
    expect(
      clampCropRect({ x: Number.NaN, y: 0, width: 10, height: 10 }, image),
    ).toEqual({ x: 0, y: 0, ...image });
  });

  test("fractional image sizes are floored", () => {
    const rect = clampCropRect(
      { x: 0, y: 0, width: 999, height: 999 },
      { width: 640.6, height: 480.4 },
    );
    expect(rect).toEqual({ x: 0, y: 0, width: 640, height: 480 });
    expect(coversImage(rect, { width: 640.6, height: 480.4 })).toBe(true);
  });
});

describe("downscaleTarget", () => {
  test("caps the long edge only when larger", () => {
    expect(downscaleTarget({ width: 4032, height: 3024 }, 2400)).toEqual({
      width: 2400,
    });
    expect(downscaleTarget({ width: 3024, height: 4032 }, 2400)).toEqual({
      height: 2400,
    });
    expect(downscaleTarget({ width: 1200, height: 1600 }, 1600)).toBeNull();
  });
});

test("the same photo and crop give the same upload key", () => {
  const rect = { x: 1, y: 2, width: 3, height: 4 };
  expect(uploadKey("file:///a.jpg", rect)).toBe(
    uploadKey("file:///a.jpg", { ...rect }),
  );
  expect(uploadKey("file:///a.jpg", rect)).not.toBe(
    uploadKey("file:///a.jpg", { ...rect, x: 2 }),
  );
});
