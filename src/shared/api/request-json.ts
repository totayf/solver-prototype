import { API_KEY, apiUrl } from "./api-origin";

/**
 * fetch + JSON against the app's API routes, surfacing the server's
 * `{ error }` message as the thrown error so screens can show it as-is.
 * HTTP failures throw `RequestError` (with the status); a network failure
 * throws whatever fetch threw.
 */
export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(API_KEY ? { "x-solver-key": API_KEY } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new RequestError(
      body?.error ?? `İstek başarısız oldu (${res.status}).`,
      res.status,
    );
  }
  return body as T;
}

/** The server answered, with an error status. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
