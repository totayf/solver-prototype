import type { SpokenWord } from "@/entities/lesson";

/**
 * When does the teacher say `quote`? Matches word by word, ignoring case
 * (Turkish-aware: I/ı, İ/i) and punctuation. Falls back to the quote's first
 * word, then to null so the caller can use the step start.
 */
export function findSpokenTime(
  quote: string,
  words: SpokenWord[],
): number | null {
  const wanted = tokens(quote);
  if (wanted.length === 0) return null;
  const spoken = words.map((w) => normalize(w.text));

  const exact = spoken.findIndex((_, start) =>
    wanted.every((token, offset) => spoken[start + offset] === token),
  );
  if (exact !== -1) return words[exact].startMs;

  const first = spoken.findIndex((word) => word === wanted[0]);
  return first !== -1 ? words[first].startMs : null;
}

/** Whether `quote` appears word for word in `text` (same matching rules). */
export function containsQuote(text: string, quote: string): boolean {
  const wanted = tokens(quote);
  const words = tokens(text);
  return (
    wanted.length > 0 &&
    words.some((_, start) =>
      wanted.every((token, offset) => words[start + offset] === token),
    )
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokens(text: string): string[] {
  return text.split(/\s+/).map(normalize).filter(Boolean);
}

function normalize(word: string): string {
  return word.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");
}
