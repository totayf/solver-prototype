import type { PendingLesson } from "@/entities/lesson";
import {
  deleteLesson,
  getLesson,
  lessonJob,
} from "@/features/create-lesson/server";

/**
 * 200 the lesson · 202 PendingLesson while it is being made · 500 { error }
 * when generation failed · 404 unknown id.
 */
export async function GET(_request: Request, { id }: { id: string }) {
  // Read the job first: it is only dropped after lesson.json is written.
  const job = lessonJob(id);
  const lesson = await getLesson(id);
  if (lesson) return Response.json(lesson);
  if (job?.error) return Response.json({ error: job.error }, { status: 500 });
  if (job) {
    const pending: PendingLesson = { id, status: "pending", stage: job.stage };
    return Response.json(pending, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

/** Removes the lesson and every file stored for it. */
export async function DELETE(_request: Request, { id }: { id: string }) {
  await deleteLesson(id);
  return Response.json({ ok: true });
}
