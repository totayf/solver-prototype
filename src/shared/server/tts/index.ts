/**
 * Narration: Gemini speech models first, OpenAI when Gemini is out of quota
 * or failing (`TTS_PROVIDER=openai` skips Gemini). Every provider returns the
 * same `SpeechClip` shape. A lesson is voiced through `createSpeechSession`,
 * which keeps one voice per lesson and reuses clips across script repairs.
 */
export { concatBytes, encodeWav, pcmDurationMs, silence } from "./pcm";
export {
  createSpeechSession,
  type NamedProvider,
  type SpeechSession,
} from "./session";
export type { SpeechClip, SpeechProvider, WordTiming } from "./types";
