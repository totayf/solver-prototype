import { generateObject, type LanguageModelUsage } from "ai";
import { z } from "zod";

import type { Rect } from "@/entities/lesson";
import { groundingConfig } from "@/shared/server/ai";

const regionBoxesSchema = z.object({
  regions: z.array(
    z.object({
      index: z.number().int().describe("Index of the description in the list."),
      found: z.boolean(),
      box_2d: z
        .array(z.number())
        .describe("[ymin, xmin, ymax, xmax], each normalized to 0-1000."),
    }),
  ),
});

/**
 * Finds parts of the photo's drawings that have no OCR word (a shaded area,
 * a bar, a curve) from the teacher's English descriptions, in one call.
 * Returns pixel rectangles keyed by description; unfound ones are left out.
 */
export async function locateRegions({
  image,
  mediaType,
  width,
  height,
  descriptions,
  onUsage,
}: {
  image: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
  descriptions: string[];
  onUsage?: (usage: LanguageModelUsage) => void;
}): Promise<Record<string, Rect>> {
  if (descriptions.length === 0) return {};

  const { object, usage } = await generateObject({
    model: groundingConfig.model,
    providerOptions: groundingConfig.providerOptions,
    schema: regionBoxesSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image, mediaType },
          {
            type: "text",
            text: [
              "Detect the tight bounding box of each described part of this exam question's figure.",
              "Set found=false when a part is not visible.",
              ...descriptions.map((d, i) => `${i}: ${d}`),
            ].join("\n"),
          },
        ],
      },
    ],
    maxRetries: 2,
  });
  onUsage?.(usage);

  const rects: Record<string, Rect> = {};
  for (const region of object.regions) {
    const description = descriptions[region.index];
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    if (!description || !region.found || region.box_2d.length !== 4) continue;
    if (!(xmax > xmin && ymax > ymin)) continue;
    rects[description] = {
      x: (xmin / 1000) * width,
      y: (ymin / 1000) * height,
      width: ((xmax - xmin) / 1000) * width,
      height: ((ymax - ymin) / 1000) * height,
    };
  }
  return rects;
}
