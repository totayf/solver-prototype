import { deleteLesson, getLesson } from "@/features/create-lesson/server";

export async function GET(_request: Request, { id }: { id: string }) {
  const lesson = await getLesson(id);
  return lesson
    ? Response.json(lesson)
    : Response.json({ error: "not found" }, { status: 404 });
}

/** Removes the lesson and every file stored for it. */
export async function DELETE(_request: Request, { id }: { id: string }) {
  await deleteLesson(id);
  return Response.json({ ok: true });
}
