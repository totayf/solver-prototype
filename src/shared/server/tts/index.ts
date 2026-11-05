import { env } from "../env";
import { synthesizeWithGemini } from "./gemini";
import { synthesizeWithOpenAI } from "./openai";
import type { SpeechProvider } from "./types";

/**
 * The active narration provider: Gemini, falling back to OpenAI when every
 * Gemini speech model is out of quota or failing. Every provider returns the
 * same `SpeechClip` shape.
 */
export const synthesize: SpeechProvider = (text) =>
  env.TTS_PROVIDER === "openai"
    ? synthesizeWithOpenAI(text)
    : synthesizeWithGemini(text).catch((error: unknown) => {
        console.warn(
          `[tts] Gemini failed, using OpenAI: ${error instanceof Error ? error.message.slice(0, 120) : error}`,
        );
        return synthesizeWithOpenAI(text);
      });

export { concatBytes, encodeWav, pcmDurationMs, silence } from "./pcm";
export type { SpeechClip, SpeechProvider, WordTiming } from "./types";
