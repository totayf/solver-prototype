import type { LanguageModelUsage } from "ai";
import type { Lesson, LessonStep, SpokenWord } from "@/entities/lesson";
import type { LessonModel } from "@/shared/server/ai";
import { type Bytes, lessonStore } from "@/shared/server/lesson-store";
import { recognizeWords } from "@/shared/server/ocr";
import {
  type SpeechClip,
  concatBytes,
  encodeWav,
  silence,
  synthesize,
} from "@/shared/server/tts";

import { writeLessonScript } from "./ai/lesson-script.agent";
import type { LessonScript } from "./ai/lesson-script.schema";
import { locateRegions } from "./ai/locate-regions.agent";
import { solveQuestion } from "./ai/solve-question.agent";
import { createLocator } from "./lib/locate";
import { type ResolveContext, resolveActions } from "./lib/resolve-actions";
import { validateScript } from "./lib/validate-script";

/**
 * Photo → lesson, generated fresh every time (no caching: a new prompt or
 * model shows up immediately). Only what the player needs is stored: the
 * photo, the narration track and the lesson itself.
 */
export async function createLesson({
  image,
  mediaType,
  model,
  onUsage,
  onStats,
}: {
  image: Bytes;
  mediaType: string;
  /** Pins the solve + script model (catalog examples); default chain otherwise. */
  model?: LessonModel;
  /** Quality signals for comparisons: repair rounds, problems left, actions dropped. */
  onStats?: (stats: LessonStats) => void;
  /** Token usage per model stage, and narration characters per speech clip (for cost reports). */
  onUsage?: (stage: UsageStage, usage: LanguageModelUsage) => void;
}): Promise<Lesson> {
  const id = newLessonId();
  const store = lessonStore(id);
  const { ocr, solution, checks, script, check, repairs, regions } =
    await planLesson({
      onUsage,
      image,
      mediaType,
      model,
    });

  const clips = await mapLimit(script.steps, TTS_CONCURRENCY, (step) =>
    synthesize(step.narration),
  );
  const { audio, timeline } = joinClips(clips, script);
  await store.writeBytes(IMAGE_FILE, image);
  await store.writeJson(IMAGE_META_FILE, { mediaType });
  await store.writeBytes(AUDIO_FILE, encodeWav(audio, clips[0].sampleRate));

  const context: ResolveContext = {
    locator: createLocator(ocr),
    figureParts: check.figures.parts,
    regions,
    solution,
  };
  let skipped = 0;
  const steps: LessonStep[] = script.steps.map((step, i) => {
    const { startMs, durationMs } = timeline.steps[i];
    const words: SpokenWord[] = (clips[i].words ?? []).map((w) => ({
      text: w.text,
      startMs: startMs + w.startMs,
      endMs: startMs + w.endMs,
    }));
    return {
      narration: step.narration,
      startMs,
      durationMs,
      words,
      actions: resolveActions({
        actions: step.actions,
        stepIndex: i,
        words,
        stepStartMs: startMs,
        stepEndMs: startMs + durationMs,
        context,
        onSkip: (action, reason) => {
          skipped += 1;
          console.warn(
            `[lesson ${id}] step ${i}: skipped ${action.type} (${reason})`,
          );
        },
      }),
    };
  });

  const lesson: Lesson = {
    id,
    title: script.title,
    answer: solution.answer,
    tools: [
      ...new Set(check.figures.layouts.map((figure) => figure.kind)),
      ...(script.showsCodeCheck && checks.length > 0 ? ["code"] : []),
    ],
    image: {
      url: `/api/lessons/${id}/image`,
      width: ocr.width,
      height: ocr.height,
    },
    audio: { url: `/api/lessons/${id}/audio`, durationMs: timeline.totalMs },
    figures: check.figures.layouts,
    steps,
  };
  await store.writeJson(LESSON_FILE, lesson);
  onStats?.({ repairs, problemsLeft: check.errors.length, skipped });
  return lesson;
}

/** Every model stage before speech: OCR → solution → script (with repairs) → region boxes. */
async function planLesson({
  image,
  mediaType,
  model,
  onUsage,
}: {
  image: Bytes;
  mediaType: string;
  model?: LessonModel;
  onUsage?: (stage: UsageStage, usage: LanguageModelUsage) => void;
}) {
  const ocr = await recognizeWords(image);
  if (ocr.words.length === 0) {
    throw new LessonError("Fotoğrafta okunabilir bir soru bulunamadı.");
  }
  const { solution, checks } = await solveQuestion({
    image,
    mediaType,
    ocr,
    model,
    onUsage: (usage) => onUsage?.("solve", usage),
  });
  const { script, check, repairs } = await writeLessonScript({
    onUsage: (usage) => onUsage?.("script", usage),
    model,
    image,
    mediaType,
    ocr,
    solution,
    checks,
  });
  const descriptions = [
    ...new Set(
      script.steps.flatMap((step) =>
        step.actions.flatMap((a) => (a.type === "region" ? [a.describe] : [])),
      ),
    ),
  ];
  const regions = await locateRegions({
    onUsage: (usage) => onUsage?.("regions", usage),
    image,
    mediaType,
    width: ocr.width,
    height: ocr.height,
    descriptions,
  });
  return { ocr, solution, checks, script, check, repairs, regions };
}

export async function getLesson(id: string): Promise<Lesson | null> {
  return isLessonId(id) ? lessonStore(id).readJson<Lesson>(LESSON_FILE) : null;
}

export async function getLessonAudio(id: string): Promise<Bytes | null> {
  return isLessonId(id) ? lessonStore(id).readBytes(AUDIO_FILE) : null;
}

export async function getLessonImage(
  id: string,
): Promise<{ bytes: Bytes; mediaType: string } | null> {
  if (!isLessonId(id)) return null;
  const store = lessonStore(id);
  const bytes = await store.readBytes(IMAGE_FILE);
  const meta = await store.readJson<{ mediaType: string }>(IMAGE_META_FILE);
  return bytes && meta ? { bytes, mediaType: meta.mediaType } : null;
}

/** Deletes everything stored for a lesson (photo, audio, lesson). */
export async function deleteLesson(id: string): Promise<void> {
  if (isLessonId(id)) await lessonStore(id).remove();
}

/** A failure the student should see as-is (Turkish message). */
export class LessonError extends Error {}

// ── Constants ────────────────────────────────────────────────────────────────

const LESSON_FILE = "lesson.json";
const AUDIO_FILE = "audio.wav";
const IMAGE_FILE = "image";
const IMAGE_META_FILE = "image.json";
const TTS_CONCURRENCY = 4;
/** Minimum breath between steps even when the script asks for none. */
const MIN_STEP_GAP_MS = 250;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Places the step clips on one continuous track: clip, pause, clip, … The
 * pause after the last step is dropped so the lesson ends on the last word.
 */
function joinClips(clips: SpeechClip[], script: LessonScript) {
  const sampleRate = clips[0].sampleRate;
  const parts: Uint8Array[] = [];
  const steps: Array<{ startMs: number; durationMs: number }> = [];
  let cursor = 0;

  clips.forEach((clip, i) => {
    steps.push({
      startMs: Math.round(cursor),
      durationMs: Math.round(clip.durationMs),
    });
    parts.push(clip.pcm);
    cursor += clip.durationMs;

    if (i < clips.length - 1) {
      const gap = Math.max(MIN_STEP_GAP_MS, script.steps[i].pauseAfterMs);
      parts.push(silence(gap, sampleRate));
      cursor += gap;
    }
  });

  return {
    audio: concatBytes(parts),
    timeline: { steps, totalMs: Math.round(cursor) },
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Random 16-hex id; the same photo sent twice is two lessons. */
function newLessonId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString("hex");
}

function isLessonId(id: string): boolean {
  return /^[0-9a-f]{16}$/.test(id);
}

export type UsageStage = "solve" | "script" | "regions";

export interface LessonStats {
  /** Repair rounds the script needed (0–2). */
  repairs: number;
  /** Validation problems still left after the last round. */
  problemsLeft: number;
  /** Actions dropped while resolving (couldn't be placed). */
  skipped: number;
}
