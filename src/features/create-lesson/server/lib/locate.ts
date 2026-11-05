import type { Rect } from "@/entities/lesson";
import type { OcrResult, OcrWord } from "@/shared/server/ocr";

/**
 * Turns the word ids the teacher cites into rectangles on the photo. Geometry
 * never goes through the model: it only knows ids, this module knows boxes.
 */
export function createLocator(ocr: OcrResult) {
  const indexById = new Map(ocr.words.map((word, index) => [word.id, index]));

  /** One rectangle per visual line covered by the ids (unknown ids are ignored). */
  function lineRects(ids: string[]): Rect[] {
    const byLine = new Map<number, OcrWord[]>();
    for (const id of ids) {
      const index = indexById.get(id);
      if (index === undefined) continue;
      const word = ocr.words[index];
      byLine.set(word.line, [...(byLine.get(word.line) ?? []), word]);
    }
    return [...byLine.values()].map(boundingRect);
  }

  /** A single rectangle around all ids, or null when none are known. */
  function unionRect(ids: string[]): Rect | null {
    const words = ids
      .map((id) => indexById.get(id))
      .filter((index) => index !== undefined)
      .map((index) => ocr.words[index]);
    return words.length > 0 ? boundingRect(words) : null;
  }

  /**
   * The option's own words: from its letter (`B` + `)`, or `B)`) up to the next
   * option on the same line, since some layouts put A/B/C side by side.
   */
  function optionRects(letter: string): Rect[] {
    const start = ocr.words.findIndex((_, i) => optionLetterAt(i) === letter);
    if (start === -1) return [];

    const words = [ocr.words[start]];
    for (let i = start + 1; i < ocr.words.length; i++) {
      const word = ocr.words[i];
      if (word.line !== words[0].line || optionLetterAt(i)) break;
      words.push(word);
    }
    return [boundingRect(words)];
  }

  /** "B)" or "B )" — olympiad booklets use lowercase letters ("b)"). */
  function optionLetterAt(index: number): string | null {
    const text = ocr.words[index]?.text ?? "";
    const next = ocr.words[index + 1]?.text ?? "";
    const glued = /^([A-Ea-e])\)$/.exec(text);
    if (glued) return glued[1].toUpperCase();
    return /^[A-Ea-e]$/.test(text) && next.startsWith(")")
      ? text.toUpperCase()
      : null;
  }

  return { lineRects, unionRect, optionRects };
}

export type Locator = ReturnType<typeof createLocator>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function boundingRect(words: OcrWord[]): Rect {
  const xs = words.flatMap((w) => w.polygon.map(([x]) => x));
  const ys = words.flatMap((w) => w.polygon.map(([, y]) => y));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
