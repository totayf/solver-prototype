import { expect, test } from "bun:test";

process.env.ANTHROPIC_API_KEY ||= "x";
process.env.OPENAI_API_KEY ||= "x";
process.env.GEMINI_API_KEY ||= "x";
process.env.GOOGLE_VISION_API_KEY ||= "x";

const { createLimiter } = await import("../src/shared/server/concurrency");
const { createSpeechSession } = await import(
  "../src/shared/server/tts/session"
);

const clip = (text: string, voice: string) =>
  ({ pcm: new Uint8Array(4), text, voice }) as never;

test("limiter caps concurrency and keeps order of results", async () => {
  const limit = createLimiter(2);
  let running = 0;
  let peak = 0;
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await Bun.sleep(10);
        running--;
        return n * 2;
      }),
    ),
  );
  expect(peak).toBe(2);
  expect(results).toEqual([2, 4, 6, 8, 10]);
});

test("limiter frees its slot when a task throws", async () => {
  const limit = createLimiter(1);
  await expect(
    limit(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(await limit(async () => 1)).toBe(1);
});

test("prefetched clips are reused, not synthesized twice", async () => {
  const calls: string[] = [];
  const session = createSpeechSession({
    concurrency: 3,
    providers: [
      {
        name: "A",
        synthesize: async (t: string) => {
          calls.push(t);
          return clip(t, "A");
        },
      },
    ],
  });
  session.prefetch(["a", "b"]);
  const out = await session.voice(["a", "b", "c"]);
  expect(calls.sort()).toEqual(["a", "b", "c"]);
  expect(out.map((c) => (c as unknown as FakeClip).text)).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("one failing clip re-voices the whole lesson with the fallback", async () => {
  const session = createSpeechSession({
    concurrency: 3,
    providers: [
      {
        name: "A",
        synthesize: async (t: string) => {
          if (t === "b") throw new Error("quota");
          return clip(t, "A");
        },
      },
      { name: "B", synthesize: async (t: string) => clip(t, "B") },
    ],
  });
  const out = await session.voice(["a", "b", "c"]);
  expect(out.map((c) => (c as unknown as FakeClip).voice)).toEqual([
    "B",
    "B",
    "B",
  ]);
});

test("a failing prefetch never throws by itself", async () => {
  const session = createSpeechSession({
    concurrency: 1,
    providers: [
      {
        name: "A",
        synthesize: async () => {
          throw new Error("down");
        },
      },
    ],
  });
  session.prefetch(["x"]);
  await Bun.sleep(5);
  await expect(session.voice(["x"])).rejects.toThrow("down");
});

// ── Types ────────────────────────────────────────────────────────────────────

/** What the fake providers return in place of a real clip. */
type FakeClip = { text: string; voice: string };
