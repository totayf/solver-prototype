import { createLimiter } from "../concurrency";
import { env } from "../env";
import { synthesizeWithGemini } from "./gemini";
import { synthesizeWithOpenAI } from "./openai";
import type { SpeechClip, SpeechProvider } from "./types";

/**
 * Narration for one lesson.
 *
 * - Clips are memoized by text, so a step whose narration survives a script
 *   repair round is synthesized once, and a draft script can be voiced
 *   speculatively (`prefetch`) while the model is still repairing it.
 * - One lesson is one voice: when any clip fails on the preferred provider,
 *   the whole lesson is re-voiced by the next one instead of switching the
 *   teacher's voice halfway through.
 */
export function createSpeechSession({
  concurrency = env.TTS_CONCURRENCY ?? DEFAULT_CONCURRENCY,
  providers = defaultProviders(),
}: {
  concurrency?: number;
  /** Preferred first; each later one is a fallback for the whole lesson. */
  providers?: NamedProvider[];
} = {}) {
  const limit = createLimiter(concurrency);
  let level = 0;
  let clips = new Map<string, Promise<SpeechClip>>();

  function clip(text: string): Promise<SpeechClip> {
    let pending = clips.get(text);
    if (!pending) {
      const { synthesize } = providers[level];
      pending = limit(() => synthesize(text));
      // A speculative clip may never be awaited; its failure is handled in voice().
      pending.catch(() => undefined);
      clips.set(text, pending);
    }
    return pending;
  }

  return {
    /** Starts voicing texts that will probably be needed; never throws. */
    prefetch(texts: string[]): void {
      for (const text of texts) clip(text);
    },

    /** Every text as a clip, in order, all in the same voice. */
    async voice(texts: string[]): Promise<SpeechClip[]> {
      for (;;) {
        const settled = await Promise.allSettled(texts.map(clip));
        const failure = settled.find((result) => result.status === "rejected");
        if (!failure) {
          return settled.map(
            (result) => (result as PromiseFulfilledResult<SpeechClip>).value,
          );
        }
        if (level === providers.length - 1) throw failure.reason;
        console.warn(
          `[tts] ${providers[level].name} failed, voicing the whole lesson with ${providers[level + 1].name}: ${describe(failure.reason)}`,
        );
        level++;
        clips = new Map();
      }
    },
  };
}

export type SpeechSession = ReturnType<typeof createSpeechSession>;

// ── Constants ────────────────────────────────────────────────────────────────

/** Steps voiced at once. A lesson has ~6–14 steps; most finish in one or two waves. */
const DEFAULT_CONCURRENCY = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultProviders(): NamedProvider[] {
  const openai = { name: "OpenAI", synthesize: synthesizeWithOpenAI };
  return env.TTS_PROVIDER === "openai"
    ? [openai]
    : [{ name: "Gemini", synthesize: synthesizeWithGemini }, openai];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : String(error);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface NamedProvider {
  name: string;
  synthesize: SpeechProvider;
}
