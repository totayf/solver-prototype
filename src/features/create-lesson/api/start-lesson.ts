import type { Lesson, PendingLesson } from "@/entities/lesson";
import { requestJson } from "@/shared/api/request-json";

/**
 * Sends the prepared photo. The server answers at once with a pending id
 * (`Prefer: respond-async`); a server that ignores it answers with the
 * whole lesson. The same bytes sent again join the running job, so a retry
 * never pays twice.
 */
export function startLesson(image: string): Promise<Lesson | PendingLesson> {
  return requestJson<Lesson | PendingLesson>("/api/lessons", {
    method: "POST",
    headers: { prefer: "respond-async" },
    body: JSON.stringify({ image }),
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

/** A few hundred KB on a slow school connection; older servers answer only when done. */
const UPLOAD_TIMEOUT_MS = 3 * 60_000;
