import { env } from "../env";
import { estimateWordTimings } from "./estimate-word-timings";
import { pcmDurationMs } from "./pcm";
import type { SpeechClip } from "./types";

/**
 * Turkish narration through Gemini's speech model. It returns raw 24 kHz PCM
 * without word timestamps, so word timings are estimated from the text.
 */
export async function synthesizeWithGemini(text: string): Promise<SpeechClip> {
  const pcm = await requestPcm(text);
  const durationMs = pcmDurationMs(pcm, SAMPLE_RATE);
  return {
    pcm,
    sampleRate: SAMPLE_RATE,
    durationMs,
    words: estimateWordTimings(text, durationMs),
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Speech models in order of preference. Each has its own daily quota; when
 * one is used up for the day the next one takes over.
 */
const MODELS = [
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
] as const;
/**
 * Models whose daily quota ran out, with when to try them again. Quotas reset
 * daily, so an exhausted model is retried after a while instead of being
 * skipped until the process restarts.
 */
const exhaustedUntil = new Map<string, number>();
const EXHAUSTED_RETRY_MS = 60 * 60_000;
const VOICE = "Achird";
const SAMPLE_RATE = 24_000;
const MAX_ATTEMPTS = 3;
/**
 * Longest rate-limit wait we accept before giving up on a clip. A student is
 * waiting: re-voicing the lesson with the fallback provider is faster than a
 * minute-long back-off.
 */
const MAX_RETRY_DELAY_MS = 12_000;
// ── Helpers ──────────────────────────────────────────────────────────────────

async function requestPcm(text: string): Promise<Uint8Array> {
  let lastError = "";
  for (const model of MODELS) {
    if ((exhaustedUntil.get(model) ?? 0) > Date.now()) continue;
    const result = await requestWithModel(model, text);
    if (result.pcm) return result.pcm;
    lastError = result.error;
    if (!result.dailyQuota) break;
    exhaustedUntil.set(model, Date.now() + EXHAUSTED_RETRY_MS);
  }
  throw new Error(`Gemini TTS failed: ${lastError}`);
}

/** Retries one model; reports whether it failed on its daily quota. */
async function requestWithModel(
  model: string,
  text: string,
): Promise<{ pcm?: Uint8Array; error: string; dailyQuota: boolean }> {
  let lastError = "";
  let waitMs = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const res = await fetchSpeech(model, text).catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (!res) {
      waitMs = attempt * 1500;
      continue;
    }

    if (res.ok) {
      const body = (await res.json()) as GeminiSpeechResponse;
      const audio = body.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData?.data,
      )?.inlineData?.data;
      if (audio) {
        return {
          pcm: unwrapPcm(new Uint8Array(Buffer.from(audio, "base64"))),
          error: "",
          dailyQuota: false,
        };
      }
      lastError = `no audio (finishReason: ${body.candidates?.[0]?.finishReason ?? "unknown"})`;
      waitMs = attempt * 1500;
    } else {
      lastError = `${res.status} ${await res.text()}`;
      if (res.status === 429 && lastError.includes("per_day")) {
        return { error: lastError, dailyQuota: true };
      }
      // Client errors other than rate limiting won't succeed on retry.
      if (res.status < 500 && res.status !== 429) break;
      waitMs = retryDelayMs(lastError) ?? attempt * 1500;
    }
  }
  return { error: lastError, dailyQuota: false };
}

/** One speech request; network failures and timeouts reject, HTTP errors resolve. */
function fetchSpeech(model: string, text: string): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
        },
      }),
    },
  );
}

/**
 * The 3.x speech models answer with a WAV file (24 kHz, 16-bit mono) rather
 * than bare PCM; the clips are joined as raw PCM, so cut out the data chunk.
 */
function unwrapPcm(bytes: Uint8Array): Uint8Array {
  const isWav =
    bytes.length > 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF";
  if (!isWav) return bytes;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      return bytes.subarray(
        offset + 8,
        Math.min(offset + 8 + size, bytes.length),
      );
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("Gemini TTS returned a WAV without audio data");
}

/** The wait a 429 asks for (`"retryDelay": "21s"`), capped; null if absent. */
function retryDelayMs(errorBody: string): number | null {
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(errorBody);
  return match
    ? Math.min(Number(match[1]) * 1000 + 500, MAX_RETRY_DELAY_MS)
    : null;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GeminiSpeechResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ inlineData?: { data?: string } }> };
  }>;
}
