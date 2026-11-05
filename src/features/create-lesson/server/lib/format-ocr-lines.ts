import type { OcrResult } from "@/shared/server/ocr";

/**
 * Renders OCR words for a prompt, one visual line per row, each word tagged
 * with its id and no coordinates — the model cites ids, the server owns
 * geometry:
 *
 *   L9: [w70]B [w71]) [w72]karmaşık [w73]- [w74]sezgiseldim
 */
export function formatOcrLines(ocr: OcrResult): string {
  const lines = new Map<number, string[]>();
  for (const word of ocr.words) {
    const row = lines.get(word.line) ?? [];
    row.push(`[${word.id}]${word.text}`);
    lines.set(word.line, row);
  }
  return [...lines.entries()]
    .map(([line, words]) => `L${line}: ${words.join(" ")}`)
    .join("\n");
}
