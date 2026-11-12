import { env } from "../env";
import type { OcrResult, OcrWord, Point } from "./types";

/**
 * Word-level OCR with Google Cloud Vision `DOCUMENT_TEXT_DETECTION`. Words come
 * back in reading order with pixel polygons; we number them and track visual
 * lines from the detected line breaks.
 */
export async function recognizeWords(image: Uint8Array): Promise<OcrResult> {
  const response = await annotate(
    JSON.stringify({
      requests: [
        {
          image: { content: Buffer.from(image).toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["tr"] },
        },
      ],
    }),
  );

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
/** Waits before the 2nd and 3rd attempt; OCR is the first step, so retry fast. */
const RETRY_DELAYS_MS = [400, 1_500];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * One annotate call, retried on what is usually momentary (network errors,
 * timeouts, 429 and 5xx). A 4xx other than 429 is our request's fault: thrown
 * at once.
 */
async function annotate(body: string): Promise<VisionAnnotation | undefined> {
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]),
      );
    }
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?key=${env.GOOGLE_VISION_API_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }

    const parsed = (await res
      .json()
      .catch(() => null)) as VisionResponse | null;
    const response = parsed?.responses?.[0];
    const error = parsed?.error ?? response?.error;
    if (res.ok && parsed && !error) return response;

    lastError = `${res.status} ${error?.message ?? ""}`.trim();
    // An error inside a 200 answer, or a 4xx other than 429, won't change on retry.
    if (res.ok || (res.status < 500 && res.status !== 429)) break;
  }
  throw new Error(`Google Vision failed: ${lastError}`);
}

/** Vision omits zero coordinates, so `{ y: 12 }` means `x = 0`. */
function toPolygon(vertices: Array<{ x?: number; y?: number }>): Point[] {
  return vertices.map((v) => [v.x ?? 0, v.y ?? 0]);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface VisionResponse {
  error?: { message?: string };
  responses?: VisionAnnotation[];
}

interface VisionAnnotation {
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
}
