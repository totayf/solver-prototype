import { env } from "../env";
import type { OcrResult, OcrWord, Point } from "./types";

/**
 * Word-level OCR with Google Cloud Vision `DOCUMENT_TEXT_DETECTION`. Words come
 * back in reading order with pixel polygons; we number them and track visual
 * lines from the detected line breaks.
 */
export async function recognizeWords(image: Uint8Array): Promise<OcrResult> {
  const res = await fetch(`${ENDPOINT}?key=${env.GOOGLE_VISION_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      requests: [
        {
          image: { content: Buffer.from(image).toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["tr"] },
        },
      ],
    }),
  });

  const body = (await res.json()) as VisionResponse;
  const response = body.responses?.[0];
  const error = body.error ?? response?.error;
  if (!res.ok || error) {
    throw new Error(`Google Vision failed: ${error?.message ?? res.status}`);
  }

  const page = response?.fullTextAnnotation?.pages?.[0];
  if (!page) return { width: 0, height: 0, words: [] };

  const words: OcrWord[] = [];
  let line = 0;
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        const symbols = word.symbols ?? [];
        words.push({
          id: `w${words.length + 1}`,
          text: symbols.map((s) => s.text).join(""),
          line,
          polygon: toPolygon(word.boundingBox?.vertices ?? []),
        });
        const lastBreak = symbols.at(-1)?.property?.detectedBreak?.type;
        if (lastBreak && LINE_BREAKS.has(lastBreak)) line++;
      }
    }
  }

  return { width: page.width ?? 0, height: page.height ?? 0, words };
}

// ── Constants ────────────────────────────────────────────────────────────────

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const LINE_BREAKS = new Set(["EOL_SURE_SPACE", "LINE_BREAK", "HYPHEN"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Vision omits zero coordinates, so `{ y: 12 }` means `x = 0`. */
function toPolygon(vertices: Array<{ x?: number; y?: number }>): Point[] {
  return vertices.map((v) => [v.x ?? 0, v.y ?? 0]);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface VisionResponse {
  error?: { message?: string };
  responses?: Array<{
    error?: { message?: string };
    fullTextAnnotation?: {
      pages?: Array<{
        width?: number;
        height?: number;
        blocks?: Array<{
          paragraphs?: Array<{
            words?: Array<{
              boundingBox?: { vertices?: Array<{ x?: number; y?: number }> };
              symbols?: Array<{
                text: string;
                property?: { detectedBreak?: { type?: string } };
              }>;
            }>;
          }>;
        }>;
      }>;
    };
  }>;
}
