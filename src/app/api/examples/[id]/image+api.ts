import { questionImage } from "@/entities/example/server";

export async function GET(_request: Request, { id }: { id: string }) {
  const image = await questionImage(id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes, {
    headers: {
      "content-type": image.mediaType,
      "cache-control": "max-age=31536000",
    },
  });
}
