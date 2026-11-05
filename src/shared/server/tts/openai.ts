import { env } from "../env";
import { estimateWordTimings } from "./estimate-word-timings";
import { pcmDurationMs } from "./pcm";
import type { SpeechClip } from "./types";

/**
 * Turkish narration through OpenAI's speech model: raw 24 kHz 16-bit mono
 * PCM, no word timestamps, so word timings are estimated from the text.
 */
export async function synthesizeWithOpenAI(text: string): Promise<SpeechClip> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: text,
        instructions: INSTRUCTIONS,
        response_format: "pcm",
      }),
    }).catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
      return null;
    });

    if (res?.ok) {
      const pcm = new Uint8Array(await res.arrayBuffer());
      const durationMs = pcmDurationMs(pcm, SAMPLE_RATE);
      return {
        pcm,
        sampleRate: SAMPLE_RATE,
        durationMs,
        words: estimateWordTimings(text, durationMs),
      };
    }
    if (res) {
      lastError = `${res.status} ${await res.text()}`;
      if (res.status < 500 && res.status !== 429) break;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`OpenAI TTS failed: ${lastError}`);
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL = "gpt-4o-mini-tts";
const VOICE = "ash";
const SAMPLE_RATE = 24_000;
const MAX_ATTEMPTS = 3;
/** Delivery only — sent as a separate field, so it is never read aloud. */
const INSTRUCTIONS =
  "Speak Turkish naturally, like a friendly, energetic teacher explaining a question. Clear and fluent.";
