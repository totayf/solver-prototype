import type { PendingLesson } from "@/entities/lesson";
import { LessonError, startLessonJob } from "@/features/create-lesson/server";
import { detectImageType } from "@/shared/server/detect-image-type";

/**
 * POST { image: base64 } → the finished lesson, generated as a job: the same
 * photo sent again while it is being made (a retry, a double tap) joins that
 * job instead of paying for a second lesson.
 *
 * With `Prefer: respond-async` (RFC 7240; the current app sends it) the answer
 * is 202 PendingLesson at once and the app polls GET /api/lessons/<id>, so a
 * dropped connection costs nothing. Without it the request waits, as builds
 * already installed expect.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    image?: unknown;
  } | null;
  if (typeof body?.image !== "string" || body.image.length === 0) {
    return Response.json(
      { error: "image (base64) is required" },
      { status: 400 },
    );
  }
  if (body.image.length > MAX_IMAGE_BASE64) {
    return Response.json(
      { error: "Fotoğraf çok büyük, biraz daha yakından çek." },
      { status: 413 },
    );
  }

  const image = new Uint8Array(Buffer.from(body.image, "base64"));
  const mediaType = detectImageType(image);
  if (!mediaType) {
    return Response.json(
      { error: "Desteklenmeyen görsel türü." },
      { status: 415 },
    );
  }

  const job = await startLessonJob({ image, mediaType });
  if (request.headers.get("prefer")?.includes("respond-async")) {
    const pending: PendingLesson = {
      id: job.id,
      status: "pending",
      stage: job.stage,
    };
    return Response.json(pending, { status: 202 });
  }

  try {
    return Response.json(await job.done);
  } catch (error) {
    const message =
      error instanceof LessonError
        ? error.message
        : "Ders oluşturulamadı, tekrar dene.";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** The app sends a ≤1600 px JPEG (a few hundred KB); this leaves room for a PNG. */
const MAX_IMAGE_BASE64 = 12_000_000;
