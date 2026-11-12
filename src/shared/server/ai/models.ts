import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

import { withFallback } from "./fallback";

/** Models a lesson can be written with; the app lets you pick one per example. */
export const LESSON_MODELS = {
  argon: "google:gemini-4-argon",
  opus: "anthropic:claude-opus-5-5",
  sonnet: "anthropic:claude-sonnet-5-5",
  sol: "openai:gpt-6.1-sol",
} as const;

export type LessonModel = keyof typeof LESSON_MODELS;

/**
 * The model for both lesson stages. Pinned when the caller picks one (no
 * fallback, so a comparison shows that model's own work, with the long
 * default deadline for olympiad benches); otherwise Gemini 4 Argon, which won
 * the comparison, with Opus taking over when it fails or hangs past the
 * stage's deadline — a student is waiting on this chain.
 */
export function lessonModel(
  pinned?: LessonModel,
  stage: LessonStage = "solve",
) {
  return pinned
    ? withFallback([LESSON_MODELS[pinned]])
    : withFallback([LESSON_MODELS.argon, LESSON_MODELS.opus], {
        attemptTimeoutMs: STUDENT_DEADLINES_MS[stage],
      });
}

export type LessonStage = "solve" | "script";

/**
 * How long one attempt of the default chain may take before the next model
 * takes over. Tune with the genMs/timings the bench scripts record.
 */
const STUDENT_DEADLINES_MS: Record<LessonStage, number> = {
  solve: 240_000,
  script: 150_000,
};

/**
 * Anthropic prompt caching for the whole request prefix. The solve tool loop
 * re-sends the photo and OCR on every step and the script repair rounds
 * re-send them per round; cached reads cost a tenth. (OpenAI and Gemini cache
 * repeated prefixes on their own.)
 */
const CACHED_PREFIX = { type: "ephemeral" } as const;

/** Solving the question: correctness over speed, so high effort. */
export const solveOptions = {
  anthropic: {
    effort: "high",
    structuredOutputMode: "outputFormat",
    cacheControl: CACHED_PREFIX,
  } satisfies AnthropicLanguageModelOptions,
  openai: {
    reasoningEffort: "high",
  } satisfies OpenAILanguageModelResponsesOptions,
  google: {
    thinkingConfig: { thinkingLevel: "high" },
  } satisfies GoogleLanguageModelOptions,
};

/**
 * Writing the lesson script from an already-verified solution: mostly
 * instruction following and Turkish prose, so medium effort is enough.
 */
export const scriptOptions = {
  anthropic: {
    effort: "medium",
    structuredOutputMode: "outputFormat",
    cacheControl: CACHED_PREFIX,
  } satisfies AnthropicLanguageModelOptions,
  openai: {
    reasoningEffort: "medium",
  } satisfies OpenAILanguageModelResponsesOptions,
  google: {
    thinkingConfig: { thinkingLevel: "medium" },
  } satisfies GoogleLanguageModelOptions,
};

/**
 * Finding described regions in a photo (bounding boxes): Gemini is trained to
 * return `box_2d` coordinates, and boxes come out better with little thinking.
 */
export const groundingConfig = {
  model: withFallback(["google:gemini-3.8-flash"], {
    attemptTimeoutMs: 45_000,
  }),
  providerOptions: {
    google: {
      thinkingConfig: { thinkingLevel: "low" },
    } satisfies GoogleLanguageModelOptions,
  },
};
