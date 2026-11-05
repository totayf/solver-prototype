import type { WordTiming } from "./types";

/**
 * Spreads a clip's duration over its words when the provider returns no
 * timestamps. Longer words take longer, and punctuation adds a short breath,
 * which is close enough for "underline as the teacher says it" until a
 * provider with real timestamps (ElevenLabs / Alania + Duyu) is plugged in.
 */
export function estimateWordTimings(
  text: string,
  durationMs: number,
): WordTiming[] {
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    charStart: match.index,
    weight: spokenWeight(match[0]),
  }));
  if (tokens.length === 0) return [];

  const speakingMs = Math.max(0, durationMs - LEAD_IN_MS - TAIL_MS);
  const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0);

  let cursor = LEAD_IN_MS;
  return tokens.map((token) => {
    const length = (token.weight / totalWeight) * speakingMs;
    const timing = {
      text: token.text,
      charStart: token.charStart,
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + length),
    };
    cursor += length;
    return timing;
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Most TTS clips start and end with a little silence. */
const LEAD_IN_MS = 120;
const TAIL_MS = 180;

const PAUSE_WEIGHT: Record<string, number> = {
  ",": 2,
  ";": 3,
  ":": 3,
  ".": 4,
  "!": 4,
  "?": 4,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function spokenWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const pause = PAUSE_WEIGHT[word.at(-1) ?? ""] ?? 0;
  return Math.max(1, letters) + pause;
}
