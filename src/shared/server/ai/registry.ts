import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry } from "ai";

import { env } from "../env";

/**
 * Central provider registry (AI SDK), same shape as Kovan web.
 *
 * Usage:
 * - `registry.languageModel('anthropic:claude-opus-5-5')`
 */
export const registry = createProviderRegistry({
  anthropic: createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    fetch: longFetch,
  }),
  openai: createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: longFetch }),
  google: createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    fetch: longFetch,
  }),
});

/**
 * Bun aborts any fetch after 300 s by default, which cuts off long reasoning
 * on hard problems; our own per-attempt deadline (fallback.ts) applies instead.
 */
function longFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, timeout: false } as RequestInit);
}

export type AiRegistry = typeof registry;
