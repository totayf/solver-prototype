/**
 * What can go wrong talking to the API, as data the UI maps to Turkish copy
 * (`friendly-error.ts`). The `message` of these errors is for logs only —
 * screens never show it.
 */

/** The server answered with an error status, or with something that isn't JSON. */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    /** The `{ error }` text of a JSON body, if there was one. */
    readonly serverMessage: string | null,
    /** False for HTML error pages, proxies and captive portals. */
    readonly isJson: boolean,
  ) {
    super(`HTTP ${status}${serverMessage ? `: ${serverMessage}` : ""}`);
    this.name = "RequestError";
  }
}

/** No answer at all: no connection, or the request ran past its timeout. */
export class NetworkError extends Error {
  constructor(
    readonly reason: "offline" | "timeout",
    options?: { cause?: unknown },
  ) {
    super(reason === "timeout" ? "Request timed out" : "Network failure");
    this.name = "NetworkError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * An error whose message is already written for the student (Turkish, "sen"
 * form) — permission prompts, photo preparation. Shown as-is.
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly kind: "image" | "permission" | "other" = "other",
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "UserFacingError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** The caller cancelled the request (screen closed, query cancelled). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}
