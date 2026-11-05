import { Pen01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";

import {
  type InkPlan,
  inkProgress,
  type Point,
  strokeProgress,
} from "../lib/ink";
import { inkHex } from "../lib/ink-colors";

/**
 * One drawing revealed up to the lesson clock: strokes trace in order, fills
 * fade in while traced, board labels appear as the pen writes them.
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
  const isMarker = plan.strokes.some((stroke) => stroke.kind === "marker");

  return (
    <g
      className={isMarker ? "marker-layer" : undefined}
      opacity={opacity < 1 ? opacity : undefined}
    >
      {plan.strokes.map((stroke, i) => {
        const drawn = strokeProgress(plan, progress, i);
        if (drawn === 0) return null;
        const color = inkHex(stroke.color);
        const key = `${i}-${stroke.d}`;

        if (stroke.kind === "text" && stroke.text) {
          const { x, y, size, anchor, text } = stroke.text;
          return (
            <text
              key={key}
              className="figure-text"
              x={x}
              y={y}
              fontSize={size * TEXT_SCALE}
              textAnchor={anchor}
              fill={color}
              opacity={Math.min(1, drawn * 1.5)}
            >
              {text}
            </text>
          );
        }
        if (stroke.kind === "fill") {
          return (
            <path
              key={key}
              d={stroke.d}
              fill={color}
              fillOpacity={(stroke.solid ? 1 : 0.18) * drawn}
              stroke="none"
            />
          );
        }
        return (
          <path
            key={key}
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
      })}
    </g>
  );
}

/**
 * Hugeicons' Pen01 with its nib (3.5, 20.5 in the 24px grid) placed exactly
 * on `point`. The body is filled white so it stays readable over text.
 */
export function Pen({ point, size }: { point: Point; size: number }) {
  const scale = size / 24;
  return (
    <g
      className="pen"
      transform={`translate(${point.x - PEN_NIB.x * scale} ${point.y - PEN_NIB.y * scale}) scale(${scale})`}
    >
      {Pen01Icon.map(([tag, attrs], i) =>
        createElement(tag, {
          ...attrs,
          key: i,
          stroke: "#0A0A0A",
          fill: i === 0 ? "#FFFFFF" : "none",
        }),
      )}
    </g>
  );
}

const PEN_NIB = { x: 3.5, y: 20.5 };
/** Keeps board labels readable when the board is half the screen wide. */
const TEXT_SCALE = 1.15;
