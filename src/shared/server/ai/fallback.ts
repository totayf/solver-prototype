import { APICallError, type LanguageModelV3 } from "@ai-sdk/provider";

import { registry } from "./registry";

/**
 * One model that tries each registry id in order and moves to the next when a
 * call throws (rate limit, outage, missing access) or hangs past
 * ATTEMPT_TIMEOUT_MS. Streaming can only fall back while the stream is being
 * opened, not after tokens started flowing.
 *
 * @example withFallback("anthropic:claude-opus-5-5", "openai:gpt-6.1-sol")
 */
export function withFallback(...ids: [ModelId, ...ModelId[]]): LanguageModelV3 {
  const models = ids.map((id) => registry.languageModel(id));
  const [primary] = models;

  return {
    specificationVersion: "v3",
    provider: "fallback",
    modelId: ids.join(" → "),
    supportedUrls: primary.supportedUrls,
    doGenerate: (options) =>
      tryInOrder(models, options.abortSignal, (m) =>
        m.doGenerate({
          ...options,
          abortSignal: withDeadline(options.abortSignal),
        }),
      ),
    doStream: (options) =>
      tryInOrder(models, options.abortSignal, (m) => m.doStream(options)),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function tryInOrder<T>(
  models: LanguageModelV3[],
  signal: AbortSignal | undefined,
  call: (model: LanguageModelV3) => PromiseLike<T>,
): Promise<T> {
  const errors: unknown[] = [];
  for (const model of models) {
    // The caller gave up: don't wake the next provider.
    if (signal?.aborted) throw signal.reason;
    for (let attempt = 0; ; attempt++) {
      const startedAt = Date.now();
      try {
        return await call(model);
      } catch (error) {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        console.warn(
          `[ai] ${model.modelId} failed after ${seconds}s: ${describe(error)}`,
        );
        // A dropped or timed-out connection is usually momentary: wait and
        // retry the same model before giving up on it. (The SDK's own retries
        // never see these: this chain rethrows them wrapped.)
        const delay = NETWORK_RETRY_DELAYS_MS[attempt];
        if (isConnectionError(error) && delay && !signal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        errors.push(error);
        break;
      }
    }
  }
  throw new AggregateError(errors, "Every model in the fallback chain failed");
}

/**
 * A hung connection (seen in practice: sockets idle for 10 minutes) must not
 * block the chain, so every attempt gets its own deadline on top of the
 * caller's signal.
 */
function withDeadline(signal: AbortSignal | undefined): AbortSignal {
  const deadline = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/** No HTTP status: the request never got an answer (refused, reset, timed out). */
function isConnectionError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === undefined;
}

const NETWORK_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

/** Generous: a high-effort solve with tool calls finishes well within it. */
const ATTEMPT_TIMEOUT_MS = 600_000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Types ────────────────────────────────────────────────────────────────────

type ModelId = Parameters<typeof registry.languageModel>[0];
