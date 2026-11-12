import { getLessonImage } from "@/features/create-lesson/server";

export async function GET(_request: Request, { id }: { id: string }) {
  const image = await getLessonImage(id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes, {
    headers: {
      "content-type": image.mediaType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
