import { useEffect, useRef, useState } from "react";

import type { Lesson } from "@/entities/lesson";

import { cameraFor, type Size } from "../lib/camera";
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
import { InkStrokes, Pen } from "./ink-strokes";
import { isBoardItem } from "./lesson-board";

/**
 * The question photo with everything the teacher's pen has drawn so far,
 * zoomed to the current focus. Drawings are SVG in image pixels inside the
 * zoomed box and are revealed from the lesson clock, so the pen pauses,
 * speeds up and seeks together with the narration.
 */
export function LessonStage({
  lesson,
  imageUrl,
  scene,
  timeMs,
}: LessonStageProps) {
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>();
  const { width, height } = lesson.image;

  // The whole question stays in view; only an explicit zoom from the teacher moves it.
  const camera = viewport
    ? cameraFor({ viewport, image: lesson.image, focus: scene.focus })
    : null;

  const pen = penPosition(scene, timeMs);
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
          <img src={imageUrl} alt="" draggable={false} />
          <svg
            className="stage-ink"
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
          >
            {scene.drawn.map((item) =>
              isBoardItem(item) ? null : (
                <InkStrokes
                  key={item.key}
                  plan={inkPlan(item.key, item.action)}
                  timeMs={timeMs}
                  opacity={fadeOf(item.action, timeMs)}
                />
              ),
            )}
            {pen && <Pen point={pen} size={height * 0.07} />}
          </svg>
          {scene.drawn.map((item) => {
            const { action } = item;
            if (action.type !== "write" || action.place !== "question")
              return null;
            const progress = inkProgress(inkPlan(item.key, action), timeMs);
            return (
              <div
                key={item.key}
                className="note handwriting"
                style={{
                  ...notePlacement(action.anchor, action.side, lesson.image),
                  color: inkHex(action.color),
                  opacity: fadeOf(action, timeMs),
                  clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
                }}
                dangerouslySetInnerHTML={{
                  __html: mathTextToHtml(action.text),
                }}
              />
            );
          })}
        </div>
      )}
      {reveal?.action.type === "reveal_answer" && (
        <div className="answer-stamp">
          {reveal.action.format === "proof" ? (
            <strong>∎ İspat tamam</strong>
          ) : (
            <>
              Cevap <strong>{reveal.action.answer}</strong>
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
function penPosition(scene: Scene, timeMs: number): Point | null {
  if (scene.latest && isBoardItem(scene.latest)) return null;
  const onPhoto = scene.drawn.filter((item) => !isBoardItem(item));
  const current = onPhoto.at(-1);
  if (!current) return null;

  const previous = onPhoto.at(-2);
  const plan = inkPlan(current.key, current.action);
  const previousPlan: InkPlan | null = previous
    ? inkPlan(previous.key, previous.action)
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

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LessonStageProps {
  lesson: Lesson;
  imageUrl: string;
  scene: Scene;
  timeMs: number;
}
