import { createLesson, LessonError } from "@/features/create-lesson/server";
import { detectImageType } from "@/shared/server/detect-image-type";

/** POST { image: base64 } → Lesson. Generation runs to completion (no streaming). */
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

  const image = new Uint8Array(Buffer.from(body.image, "base64"));
  const mediaType = detectImageType(image);
  if (!mediaType) {
    return Response.json(
      { error: "Desteklenmeyen görsel türü." },
      { status: 415 },
    );
  }

  try {
    return Response.json(await createLesson({ image, mediaType }));
  } catch (error) {
    console.error("[api/lessons] generation failed", error);
    const message =
      error instanceof LessonError
        ? error.message
        : "Ders oluşturulamadı, tekrar dene.";
    return Response.json({ error: message }, { status: 500 });
  }
}
