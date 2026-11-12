import type { Lesson } from "@/entities/lesson";

import { cameraFor } from "../lib/camera";
import {
  type InkPlan,
  inkPlan,
  inkProgress,
  type Point,
  penTip,
} from "../lib/ink";
import { inkHex } from "../lib/ink-colors";
import { mathTextToHtml } from "../lib/math-text";
import { notePlacement } from "../lib/note-placement";
import { fadeOf, type Scene } from "../lib/timeline";
import { InkStrokes, PenTip, SettledInk, splitSettled } from "./ink-strokes";
import { isBoardItem } from "./lesson-board";
import { useElementSize } from "./use-element-size";

/**
 * The question photo with everything the teacher's pen has drawn so far,
 * zoomed to the current focus. Drawings are SVG in image pixels inside the
 * zoomed box and are revealed from the lesson clock, so the pen pauses,
 * speeds up and seeks together with the narration. Finished drawings sit in
 * a static layer; only what is moving renders per frame.
 */
export function LessonStage({
  lesson,
  imageUrl,
  scene,
  timeMs,
  onImageError,
}: LessonStageProps) {
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>();
  const { width, height } = lesson.image;

  // The whole question stays in view; only an explicit zoom from the teacher moves it.
  const camera = viewport
    ? cameraFor({ viewport, image: lesson.image, focus: scene.focus })
    : null;

  const onPhoto = scene.drawn.filter((item) => !isBoardItem(item));
  const { settled, live } = splitSettled(lesson.id, onPhoto, timeMs);
  const pen = penPosition(lesson.id, scene, timeMs);
  const reveal = scene.drawn.find(
    (item) => item.action.type === "reveal_answer",
  );

  return (
    <div ref={viewportRef} className="stage">
      {camera && (
        <div
          className="stage-canvas"
          style={{
            left: camera.left,
            top: camera.top,
            width: camera.width,
            height: camera.height,
            transform: `scale(${camera.scale})`,
            fontSize: camera.height * 0.06,
          }}
        >
          <img src={imageUrl} alt="" draggable={false} onError={onImageError} />
          <svg
            className="stage-ink"
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
          >
            <SettledInk
              lessonId={lesson.id}
              items={settled}
              signature={settled.map((item) => item.key).join(",")}
            />
            {live.map((item) => (
              <InkStrokes
                key={item.key}
                plan={inkPlan(lesson.id, item.key, item.action)}
                timeMs={timeMs}
                opacity={fadeOf(item.action, timeMs)}
              />
            ))}
          </svg>
          {scene.drawn.map((item) => {
            const { action } = item;
            if (action.type !== "write" || action.place !== "question")
              return null;
            const progress = inkProgress(
              inkPlan(lesson.id, item.key, action),
              timeMs,
            );
            return (
              <div
                key={item.key}
                className="note handwriting"
                style={{
                  ...notePlacement(action.anchor, action.side, lesson.image),
                  color: inkHex(action.color),
                  opacity: fadeOf(action, timeMs),
                  clipPath:
                    progress < 1
                      ? `inset(0 ${(1 - progress) * 100}% 0 0)`
                      : undefined,
                }}
                dangerouslySetInnerHTML={{
                  __html: mathTextToHtml(action.text),
                }}
              />
            );
          })}
          {pen && (
            <PenTip
              point={pen}
              scale={camera.width / width}
              size={camera.height * 0.07}
            />
          )}
        </div>
      )}
      {reveal?.action.type === "reveal_answer" && (
        <div className="answer-stamp" role="status">
          {reveal.action.format === "proof" ? (
            <strong>∎ İspat tamam</strong>
          ) : (
            <>
              <span className="answer-label">Cevap</span>
              <strong
                className={
                  reveal.action.answer.length > 3 ? "answer-long" : undefined
                }
              >
                {reveal.action.answer}
              </strong>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pen tip for the most recent thing drawn on the photo. While the teacher is
 * on the board the pen is there instead.
 */
function penPosition(
  lessonId: string,
  scene: Scene,
  timeMs: number,
): Point | null {
  if (scene.latest && isBoardItem(scene.latest)) return null;
  const onPhoto = scene.drawn.filter((item) => !isBoardItem(item));
  const current = onPhoto.at(-1);
  if (!current) return null;

  const previous = onPhoto.at(-2);
  const plan = inkPlan(lessonId, current.key, current.action);
  const previousPlan: InkPlan | null = previous
    ? inkPlan(lessonId, previous.key, previous.action)
    : null;
  const anchor =
    current.action.type === "write" && current.action.place === "question"
      ? {
          x: current.action.anchor.x + current.action.anchor.width,
          y: current.action.anchor.y,
        }
      : null;
  return penTip(plan, previousPlan, anchor, timeMs);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LessonStageProps {
  lesson: Lesson;
  imageUrl: string;
  scene: Scene;
  timeMs: number;
  onImageError?: () => void;
}
