import { API_KEY, apiUrl } from "./api-origin";
import { isAbortError, NetworkError, RequestError } from "./errors";

export { NetworkError, RequestError, UserFacingError } from "./errors";

/**
 * fetch + JSON against the app's API routes, with a timeout per request.
 * Failures are typed so screens can word them (`friendlyError`), never shown
 * raw: an error status or a non-JSON answer throws `RequestError`, no answer
 * (offline, timeout) throws `NetworkError`. Aborting through `init.signal`
 * rethrows the AbortError.
 */
export async function requestJson<T>(
  path: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, ...init }: RequestJsonInit = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const outer = init.signal;
  const forwardAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener("abort", forwardAbort);

  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { "x-solver-key": API_KEY } : {}),
        ...init.headers,
      },
    });
    const text = await res.text();
    const body = parseJson(text);
    if (!res.ok || body === undefined) {
      throw new RequestError(res.status, errorText(body), body !== undefined);
    }
    return body as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timedOut) throw new NetworkError("timeout", { cause: error });
    if (isAbortError(error)) throw error;
    throw new NetworkError("offline", { cause: error });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forwardAbort);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** A poll or a small JSON read; uploads pass a longer one. */
const DEFAULT_TIMEOUT_MS = 15_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface RequestJsonInit extends RequestInit {
  /** Abort and throw `NetworkError("timeout")` after this long (default 15 s). */
  timeoutMs?: number;
}
