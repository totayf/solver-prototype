import type { Lesson } from "@/entities/lesson";

/**
 * Subtitle lines for the narration: each step's spoken words cut into short
 * lines at sentence ends (or a comma once a line is long enough), timed by
 * the words themselves. A step without word timings is one line over the
 * whole step.
 */
export function buildCaptions(lesson: Lesson): CaptionLine[] {
  return lesson.steps.flatMap((step) => {
    const stepEnd = step.startMs + step.durationMs;
    if (step.words.length === 0) {
      const text = step.narration.trim();
      return text ? [{ text, startMs: step.startMs, endMs: stepEnd }] : [];
    }

    const lines: CaptionLine[] = [];
    let words: typeof step.words = [];
    const flush = () => {
      if (words.length === 0) return;
      lines.push({
        text: words.map((w) => w.text).join(" "),
        startMs: words[0].startMs,
        endMs: words.at(-1)?.endMs ?? words[0].endMs,
      });
      words = [];
    };
    for (const word of step.words) {
      words.push(word);
      const sentenceEnd = /[.!?…:;]["'”’)]*$/.test(word.text);
      const softBreak =
        /,["'”’)]*$/.test(word.text) && words.length >= SOFT_MIN;
      if (sentenceEnd || softBreak || words.length >= MAX_WORDS) flush();
    }
    flush();
    // Each line stays up until the next one starts (or the step ends).
    return lines.map((line, i) => ({
      ...line,
      endMs: Math.max(line.endMs, lines[i + 1]?.startMs ?? stepEnd),
    }));
  });
}

/** The line being spoken at `ms`, or null in a pause between steps. */
export function captionAt(
  lines: CaptionLine[],
  ms: number,
): CaptionLine | null {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = lines[mid];
    if (ms < line.startMs) hi = mid - 1;
    else if (ms >= line.endMs) lo = mid + 1;
    else return line;
  }
  return null;
}

/** Moments a caption appears or changes (for the render schedule). */
export function captionMarks(lines: CaptionLine[]): number[] {
  return lines.flatMap((line) => [line.startMs, line.endMs]);
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_WORDS = 12;
const SOFT_MIN = 6;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaptionLine {
  text: string;
  startMs: number;
  endMs: number;
}
