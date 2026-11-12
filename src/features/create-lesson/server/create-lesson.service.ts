import type { LanguageModelUsage } from "ai";
import type {
  GenerationStage,
  Lesson,
  LessonStep,
  SpokenWord,
} from "@/entities/lesson";
import type { LessonModel } from "@/shared/server/ai";
import { type Bytes, lessonStore } from "@/shared/server/lesson-store";
import { recognizeWords } from "@/shared/server/ocr";
import {
  concatBytes,
  createSpeechSession,
  encodeWav,
  type SpeechClip,
  silence,
} from "@/shared/server/tts";

import { writeLessonScript } from "./ai/lesson-script.agent";
import type { LessonScript } from "./ai/lesson-script.schema";
import { locateRegions } from "./ai/locate-regions.agent";
import { solveQuestion } from "./ai/solve-question.agent";
import { LessonError } from "./lesson-error";
import { createLocator } from "./lib/locate";
import { type ResolveContext, resolveActions } from "./lib/resolve-actions";

/**
 * Photo → lesson, generated fresh every time (no result cache: a new prompt or
 * model shows up immediately; `lesson-jobs.ts` only joins a retry of a photo
 * already being made). Only what the player needs is stored: the photo, the
 * narration track and the lesson itself.
 *
 * Independent work overlaps: the photo is stored while the models run, and
 * the narration is voiced while board regions are located (and already while
 * a script repair round runs, see `planLesson`). `lesson.json` is written
 * last, so a reader polling for it never finds a lesson without its media.
 */
export async function createLesson({
  id = newLessonId(),
  image,
  mediaType,
  model,
  onUsage,
  onStats,
  onStage,
}: {
  /** Reserved by the caller (a job that answers before generation ends); new otherwise. */
  id?: string;
  image: Bytes;
  mediaType: string;
  /** Pins the solve + script model (catalog examples); default chain otherwise. */
  model?: LessonModel;
  /** Quality and speed signals for comparisons: repairs, problems, drops, stage timings. */
  onStats?: (stats: LessonStats) => void;
  /** Token usage per model stage, and narration characters per speech clip (for cost reports). */
  onUsage?: (stage: UsageStage, usage: LanguageModelUsage) => void;
  /** The stage generation just entered, for a progress display. */
  onStage?: (stage: GenerationStage) => void;
}): Promise<Lesson> {
  const startedAt = Date.now();
  const store = lessonStore(id);
  const savingImage = Promise.all([
    store.writeBytes(IMAGE_FILE, image),
    store.writeJson(IMAGE_META_FILE, { mediaType }),
  ]);
  // Awaited below; this only keeps a failed write from going unhandled meanwhile.
  savingImage.catch(() => undefined);

  try {
    const plan = await planLesson({
      image,
      mediaType,
      model,
      onUsage,
      onStage,
    });
    const { ocr, solution, checks, script, check, repairs, regions, clips } =
      plan;
    const { audio, timeline } = joinClips(clips, script);
    const savingAudio = store.writeBytes(
      AUDIO_FILE,
      encodeWav(audio, clips[0].sampleRate),
    );

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
    await Promise.all([savingImage, savingAudio]);
    await store.writeJson(LESSON_FILE, lesson);
    onStats?.({
      repairs,
      problemsLeft: check.errors.length,
      skipped,
      timings: { ...plan.timings, totalMs: Date.now() - startedAt },
    });
    return lesson;
  } catch (error) {
    // No half-made lessons on disk: the photo was stored before we knew.
    await savingImage.catch(() => undefined);
    await store.remove().catch(() => undefined);
    throw error;
  }
}

/**
 * Every model stage, in dependency order: OCR → solution → script (with
 * repairs) → narration ‖ region boxes. Narration needs only the script and
 * region boxes only its descriptions, so those two run side by side; drafts
 * are voiced speculatively, so steps a repair round leaves unchanged are
 * already spoken when it ends.
 */
async function planLesson({
  image,
  mediaType,
  model,
  onUsage,
  onStage,
}: {
  image: Bytes;
  mediaType: string;
  model?: LessonModel;
  onUsage?: (stage: UsageStage, usage: LanguageModelUsage) => void;
  onStage?: (stage: GenerationStage) => void;
}) {
  const timings = { ocrMs: 0, solveMs: 0, scriptMs: 0, voiceMs: 0 };
  const timed = async <T>(
    stage: keyof typeof timings,
    run: () => Promise<T>,
  ): Promise<T> => {
    const started = Date.now();
    try {
      return await run();
    } finally {
      timings[stage] = Date.now() - started;
    }
  };

  onStage?.("reading");
  const ocr = await timed("ocrMs", () => recognizeWords(image));
  if (ocr.words.length === 0) {
    throw new LessonError("Fotoğrafta okunabilir bir soru bulunamadı.");
  }

  onStage?.("solving");
  const { solution, checks } = await timed("solveMs", () =>
    solveQuestion({
      image,
      mediaType,
      ocr,
      model,
      onUsage: (usage) => onUsage?.("solve", usage),
    }),
  );

  onStage?.("writing");
  const speech = createSpeechSession();
  const { script, check, repairs } = await timed("scriptMs", () =>
    writeLessonScript({
      onUsage: (usage) => onUsage?.("script", usage),
      onDraft: (draft) => speech.prefetch(narrations(draft)),
      model,
      image,
      mediaType,
      ocr,
      solution,
      checks,
    }),
  );

  onStage?.("voicing");
  const descriptions = [
    ...new Set(
      script.steps.flatMap((step) =>
        step.actions.flatMap((a) => (a.type === "region" ? [a.describe] : [])),
      ),
    ),
  ];
  const [clips, regions] = await timed("voiceMs", () =>
    Promise.all([
      speech.voice(narrations(script)),
      locateRegions({
        onUsage: (usage) => onUsage?.("regions", usage),
        image,
        mediaType,
        width: ocr.width,
        height: ocr.height,
        descriptions,
      }).catch((error: unknown) => {
        // Region marks are extras: without boxes they are skipped, the lesson stands.
        console.warn(
          `[lesson] region boxes failed, skipping ${descriptions.length} region mark(s): ${error instanceof Error ? error.message.slice(0, 160) : error}`,
        );
        return {};
      }),
    ]),
  );
  return {
    ocr,
    solution,
    checks,
    script,
    check,
    repairs,
    regions,
    clips,
    timings,
  };
}

export { LessonError };

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
  const [bytes, meta] = await Promise.all([
    store.readBytes(IMAGE_FILE),
    store.readJson<{ mediaType: string }>(IMAGE_META_FILE),
  ]);
  return bytes && meta ? { bytes, mediaType: meta.mediaType } : null;
}

/** Deletes everything stored for a lesson (photo, audio, lesson). */
export async function deleteLesson(id: string): Promise<void> {
  if (isLessonId(id)) await lessonStore(id).remove();
}

// ── Constants ────────────────────────────────────────────────────────────────

const LESSON_FILE = "lesson.json";
const AUDIO_FILE = "audio.wav";
const IMAGE_FILE = "image";
const IMAGE_META_FILE = "image.json";
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

function narrations(script: LessonScript): string[] {
  return script.steps.map((step) => step.narration);
}

/** Random 16-hex id. */
export function newLessonId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString("hex");
}

export function isLessonId(id: string): boolean {
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
  /** Wall-clock per stage; voiceMs covers narration and region boxes, which overlap. */
  timings: {
    ocrMs: number;
    solveMs: number;
    scriptMs: number;
    voiceMs: number;
    totalMs: number;
  };
}
