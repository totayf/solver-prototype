import { Pen01Icon } from "@hugeicons/core-free-icons";
import { createElement, memo } from "react";

import {
  activeStroke,
  type InkPlan,
  inkPlan,
  inkProgress,
  type Point,
  type Stroke,
} from "../lib/ink";
import { inkHex } from "../lib/ink-colors";
import { fadeOf, type TimedAction } from "../lib/timeline";

/**
 * Splits drawings into finished ones (fully drawn, not fading) and the few
 * still moving. Finished ones go to `SettledInk`, which re-renders only when
 * that set changes; the moving ones re-render per frame.
 */
export function splitSettled(
  lessonId: string,
  items: TimedAction[],
  timeMs: number,
): { settled: TimedAction[]; live: TimedAction[] } {
  const settled: TimedAction[] = [];
  const live: TimedAction[] = [];
  for (const item of items) {
    const plan = inkPlan(lessonId, item.key, item.action);
    const done =
      inkProgress(plan, timeMs) === 1 && fadeOf(item.action, timeMs) === 1;
    (done ? settled : live).push(item);
  }
  return { settled, live };
}

/** Finished drawings as one static layer (compares by the set of keys only). */
export const SettledInk = memo(
  function SettledInk({
    lessonId,
    items,
  }: {
    lessonId: string;
    items: TimedAction[];
    signature: string;
  }) {
    return (
      <>
        {items.map((item) => {
          const plan = inkPlan(lessonId, item.key, item.action);
          return (
            <g key={item.key} className={markerClass(plan)}>
              <DoneStrokes plan={plan} count={plan.strokes.length} />
            </g>
          );
        })}
      </>
    );
  },
  (a, b) => a.lessonId === b.lessonId && a.signature === b.signature,
);

/**
 * One drawing revealed up to the lesson clock: strokes trace in order, fills
 * fade in while traced, board labels appear as the pen writes them. Strokes
 * already finished are memoized; only the active one renders per frame.
 */
export function InkStrokes({
  plan,
  timeMs,
  opacity = 1,
}: {
  plan: InkPlan;
  timeMs: number;
  /** Below 1 while a temporary mark fades out. */
  opacity?: number;
}) {
  const progress = inkProgress(plan, timeMs);
  if (progress === 0) return null;
  const { index, drawn } = activeStroke(plan, progress);
  const active = plan.strokes[index];

  return (
    <g
      className={markerClass(plan)}
      opacity={opacity < 1 ? opacity : undefined}
    >
      <DoneStrokes plan={plan} count={index} />
      {active && drawn > 0 && <StrokeShape stroke={active} drawn={drawn} />}
    </g>
  );
}

/**
 * Pen tip as an HTML element moved with a GPU transform — no SVG filter
 * re-run per frame (its shadow is drawn into the icon). `point` and `scale`
 * convert the drawing's units to CSS pixels of the positioned parent.
 */
export function PenTip({
  point,
  scale,
  size,
}: {
  point: Point;
  /** CSS pixels per drawing unit. */
  scale: number;
  /** Pen size in CSS pixels. */
  size: number;
}) {
  const unit = size / 24;
  const x = point.x * scale - PEN_NIB.x * unit;
  const y = point.y * scale - PEN_NIB.y * unit;
  return (
    <div
      className="pen-tip"
      style={{
        width: size,
        height: size,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
      aria-hidden
    >
      <PenIcon />
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

/** The first `count` strokes, fully drawn. Memoized: changes only when `count` does. */
const DoneStrokes = memo(function DoneStrokes({
  plan,
  count,
}: {
  plan: InkPlan;
  count: number;
}) {
  return (
    <>
      {plan.strokes.slice(0, count).map((stroke, i) => (
        // Strokes never reorder within a plan: the index is a stable key.
        <StrokeShape key={i} stroke={stroke} drawn={1} />
      ))}
    </>
  );
});

function StrokeShape({ stroke, drawn }: { stroke: Stroke; drawn: number }) {
  const color = inkHex(stroke.color);
  if (stroke.kind === "text" && stroke.text) {
    const { x, y, size, anchor, text } = stroke.text;
    return (
      <text
        className="figure-text"
        x={x}
        y={y}
        fontSize={size * TEXT_SCALE}
        textAnchor={anchor}
        fill={color}
        opacity={drawn < 1 ? Math.min(1, drawn * 1.5) : undefined}
      >
        {text}
      </text>
    );
  }
  if (stroke.kind === "fill") {
    return (
      <path
        d={stroke.d}
        fill={color}
        fillOpacity={(stroke.solid ? 1 : 0.18) * drawn}
        stroke="none"
      />
    );
  }
  return (
    <path
      d={stroke.d}
      pathLength={1}
      className={stroke.kind}
      // A style, not the attribute: the stylesheet's stroke would win.
      style={stroke.kind === "ink" ? { stroke: color } : undefined}
      strokeWidth={stroke.width}
      strokeDasharray={drawn < 1 ? "1 1" : undefined}
      strokeDashoffset={drawn < 1 ? 1 - drawn : undefined}
      fill="none"
    />
  );
}

/**
 * Hugeicons' Pen01 with a soft offset shadow drawn as a path, so moving it
 * never re-runs a blur. The body is filled white to stay readable over text.
 */
const PenIcon = memo(function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <g transform="translate(0.5 1)" opacity={0.22}>
        {Pen01Icon.map(([tag, attrs], i) =>
          createElement(tag, {
            ...attrs,
            key: i,
            stroke: "#000000",
            fill: i === 0 ? "#000000" : "none",
          }),
        )}
      </g>
      {Pen01Icon.map(([tag, attrs], i) =>
        createElement(tag, {
          ...attrs,
          key: i,
          stroke: "#0A0A0A",
          fill: i === 0 ? "#FFFFFF" : "none",
        }),
      )}
    </svg>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function markerClass(plan: InkPlan): string | undefined {
  return plan.strokes.some((stroke) => stroke.kind === "marker")
    ? "marker-layer"
    : undefined;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** The nib of Pen01 in its 24px grid. */
const PEN_NIB = { x: 3.5, y: 20.5 };
/** Keeps board labels readable when the board is half the screen wide. */
const TEXT_SCALE = 1.15;
