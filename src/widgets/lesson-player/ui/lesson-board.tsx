import { useEffect, useRef } from "react";

import type { FigureLayout, Lesson } from "@/entities/lesson";

import { inkPlan, inkProgress, penTip } from "../lib/ink";
import { inkHex } from "../lib/ink-colors";
import { mathTextToHtml } from "../lib/math-text";
import { fadeOf, type Scene, type TimedAction } from "../lib/timeline";
import { InkStrokes, Pen } from "./ink-strokes";

/**
 * Side board: working lines and figures stacked in the order the teacher
 * starts them; a figure drawn over several steps keeps growing in place.
 * Opens (half the screen) only once something is written on it and follows
 * the latest item.
 */
export function LessonBoard({ lesson, scene, timeMs }: LessonBoardProps) {
  const blocks = boardBlocks(scene, lesson.figures ?? []);
  const latest =
    scene.latest && isBoardItem(scene.latest) ? scene.latest : null;
  const activeBlock = latest ? blockKeyOf(latest) : null;
  const activeRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active block changes or grows
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeBlock, blocks.length]);

  return (
    <aside
      className={`board ${blocks.length > 0 ? "open" : ""}`}
      aria-label="Tahta"
    >
      <div className="board-inner">
        {blocks.map((block) => (
          <div
            key={block.key}
            ref={block.key === activeBlock ? activeRef : undefined}
            className="board-block"
          >
            {block.kind === "note" ? (
              <Note item={block.item} timeMs={timeMs} />
            ) : (
              <Figure
                layout={block.layout}
                items={block.items}
                latest={latest}
                timeMs={timeMs}
              />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function Note({ item, timeMs }: { item: TimedAction; timeMs: number }) {
  if (item.action.type !== "write") return null;
  const progress = inkProgress(inkPlan(item.key, item.action), timeMs);
  return (
    <p
      className="board-line handwriting"
      style={{
        color: inkHex(item.action.color),
        opacity: fadeOf(item.action, timeMs),
        clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
      }}
      dangerouslySetInnerHTML={{ __html: mathTextToHtml(item.action.text) }}
    />
  );
}

function Figure({
  layout,
  items,
  latest,
  timeMs,
}: {
  layout: FigureLayout;
  items: TimedAction[];
  latest: TimedAction | null;
  timeMs: number;
}) {
  const drawing = latest && items.includes(latest) ? latest : null;
  const pen = drawing
    ? penTip(inkPlan(drawing.key, drawing.action), null, null, timeMs)
    : null;

  return (
    <svg
      className="board-figure"
      viewBox={`0 0 1000 ${layout.height}`}
      aria-hidden
    >
      {items.map((item) => (
        <InkStrokes
          key={item.key}
          plan={inkPlan(item.key, item.action)}
          timeMs={timeMs}
          opacity={fadeOf(item.action, timeMs)}
        />
      ))}
      {pen && <Pen point={pen} size={64} />}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Board items drawn so far, grouped into notes and figures (by figure id). */
function boardBlocks(scene: Scene, layouts: FigureLayout[]): BoardBlock[] {
  const blocks: BoardBlock[] = [];
  const figures = new Map<string, FigureBlock>();

  for (const item of scene.drawn) {
    const { action } = item;
    if (action.type === "write" && action.place === "board") {
      blocks.push({ kind: "note", key: item.key, item });
    } else if (action.type === "figure") {
      const existing = figures.get(action.figure);
      if (existing) {
        existing.items.push(item);
        continue;
      }
      const layout = layouts.find((l) => l.id === action.figure);
      if (!layout) continue;
      const block: FigureBlock = {
        kind: "figure",
        key: `figure:${action.figure}`,
        layout,
        items: [item],
      };
      figures.set(action.figure, block);
      blocks.push(block);
    }
  }
  return blocks;
}

export function isBoardItem(item: TimedAction): boolean {
  const { action } = item;
  return (
    action.type === "figure" ||
    (action.type === "write" && action.place === "board")
  );
}

function blockKeyOf(item: TimedAction): string {
  return item.action.type === "figure"
    ? `figure:${item.action.figure}`
    : item.key;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LessonBoardProps {
  lesson: Lesson;
  scene: Scene;
  timeMs: number;
}

interface FigureBlock {
  kind: "figure";
  key: string;
  layout: FigureLayout;
  items: TimedAction[];
}

type BoardBlock =
  | { kind: "note"; key: string; item: TimedAction }
  | FigureBlock;
