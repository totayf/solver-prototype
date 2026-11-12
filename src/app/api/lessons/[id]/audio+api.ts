import { getLessonAudio } from "@/features/create-lesson/server";

/**
 * The lesson's narration WAV. Supports byte ranges: browsers (and WebKit in
 * particular) need them to read the duration and to seek.
 */
export async function GET(request: Request, { id }: { id: string }) {
  const audio = await getLessonAudio(id);
  if (!audio) return new Response(null, { status: 404 });

  const headers = {
    "content-type": "audio/wav",
    "accept-ranges": "bytes",
    // A lesson's audio never changes: let the WebView keep it.
    "cache-control": "public, max-age=31536000, immutable",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range) {
    return new Response(audio, {
      headers: { ...headers, "content-length": String(audio.byteLength) },
    });
  }

  const size = audio.byteLength;
  const start = range[1] ? Number(range[1]) : size - Number(range[2]);
  const end =
    range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start < 0 || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${size}` },
    });
  }

  return new Response(audio.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
    },
  });
}
