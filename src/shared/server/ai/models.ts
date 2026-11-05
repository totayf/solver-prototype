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
 * fallback, so a comparison shows that model's own work); otherwise Gemini 4
 * Argon, which won the comparison, with Opus taking over when it fails.
 */
export function lessonModel(pinned?: LessonModel) {
  return pinned
    ? withFallback(LESSON_MODELS[pinned])
    : withFallback(LESSON_MODELS.argon, LESSON_MODELS.opus);
}

/** Solving the question: correctness over speed, so high effort. */
export const solveOptions = {
  anthropic: {
    effort: "high",
    structuredOutputMode: "outputFormat",
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
  model: withFallback("google:gemini-3.8-flash"),
  providerOptions: {
    google: {
      thinkingConfig: { thinkingLevel: "low" },
    } satisfies GoogleLanguageModelOptions,
  },
};
