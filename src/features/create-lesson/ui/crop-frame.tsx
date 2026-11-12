import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import { Image, type LayoutRectangle, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import type { PixelRect } from "../lib/crop-rect";

// Grab modes and sizes. Declared before the worklets below: a worklet captures
// the values of outer constants when it is created, so they must exist by then.
const LEFT = 1;
const RIGHT = 2;
const TOP = 4;
const BOTTOM = 8;
const MOVE = 16;
/** Finger slop around an edge, in points. */
const HIT = 28;
const MIN_SIZE = 60;
const PAD = 20;

/**
 * The photo with a free crop frame: drag a corner or an edge to resize, drag
 * inside to move. Outside the frame is dimmed. The parent reads the result in
 * photo pixels through `ref.crop()`. `initialCrop` reopens the frame where
 * the student left it (after a failed send).
 */
export function CropFrame({
  uri,
  imageSize,
  initialCrop,
  ref,
}: CropFrameProps) {
  const [box, setBox] = useState<LayoutRectangle | null>(null);
  const fit = box ? fitContain(imageSize, box) : null;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const bounds = useSharedValue({ left: 0, top: 0, right: 0, bottom: 0 });
  const mode = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });

  // A new photo (or a rotation) starts with a frame just inside its edges,
  // or with the student's own crop when there is one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the fitted photo changes
  useEffect(() => {
    if (!fit) return;
    bounds.value = {
      left: fit.left,
      top: fit.top,
      right: fit.left + fit.width,
      bottom: fit.top + fit.height,
    };
    if (initialCrop) {
      x.value = fit.left + initialCrop.x * fit.scale;
      y.value = fit.top + initialCrop.y * fit.scale;
      w.value = Math.max(MIN_SIZE, initialCrop.width * fit.scale);
      h.value = Math.max(MIN_SIZE, initialCrop.height * fit.scale);
      return;
    }
    const inset = Math.min(fit.width, fit.height) * 0.05;
    x.value = fit.left + inset;
    y.value = fit.top + inset;
    w.value = fit.width - inset * 2;
    h.value = fit.height - inset * 2;
  }, [fit?.left, fit?.top, fit?.width, fit?.height]);

  useImperativeHandle(ref, () => ({
    crop: () => {
      if (!fit) return { x: 0, y: 0, ...imageSize };
      return {
        x: (x.value - fit.left) / fit.scale,
        y: (y.value - fit.top) / fit.scale,
        width: w.value / fit.scale,
        height: h.value / fit.scale,
      };
    },
  }));

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      mode.value = grabMode(e.x, e.y, x.value, y.value, w.value, h.value);
      start.value = { x: x.value, y: y.value, w: w.value, h: h.value };
    })
    .onUpdate((e) => {
      const s = start.value;
      const b = bounds.value;
      const m = mode.value;
      const dx = e.translationX;
      const dy = e.translationY;
      if (m & MOVE) {
        x.value = clamp(s.x + dx, b.left, b.right - s.w);
        y.value = clamp(s.y + dy, b.top, b.bottom - s.h);
        return;
      }
      if (m & LEFT) {
        const left = clamp(s.x + dx, b.left, s.x + s.w - MIN_SIZE);
        x.value = left;
        w.value = s.x + s.w - left;
      }
      if (m & RIGHT) {
        w.value = clamp(s.x + s.w + dx, s.x + MIN_SIZE, b.right) - s.x;
      }
      if (m & TOP) {
        const top = clamp(s.y + dy, b.top, s.y + s.h - MIN_SIZE);
        y.value = top;
        h.value = s.y + s.h - top;
      }
      if (m & BOTTOM) {
        h.value = clamp(s.y + s.h + dy, s.y + MIN_SIZE, b.bottom) - s.y;
      }
    });

  const frameStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));
  const dimTop = useAnimatedStyle(() => ({ height: y.value }));
  const dimBottom = useAnimatedStyle(() => ({ top: y.value + h.value }));
  const dimLeft = useAnimatedStyle(() => ({
    top: y.value,
    height: h.value,
    width: x.value,
  }));
  const dimRight = useAnimatedStyle(() => ({
    top: y.value,
    height: h.value,
    left: x.value + w.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {fit && (
          <Image
            source={{ uri }}
            style={{
              position: "absolute",
              left: fit.left,
              top: fit.top,
              width: fit.width,
              height: fit.height,
            }}
          />
        )}
        <Animated.View style={[DIM, { top: 0, left: 0, right: 0 }, dimTop]} />
        <Animated.View
          style={[DIM, { left: 0, right: 0, bottom: 0 }, dimBottom]}
        />
        <Animated.View style={[DIM, { left: 0 }, dimLeft]} />
        <Animated.View style={[DIM, { right: 0 }, dimRight]} />
        <Animated.View style={[FRAME, frameStyle]} pointerEvents="none">
          {GRID.map((style, i) => (
            <View key={i} style={style} />
          ))}
          {CORNERS.map((style, i) => (
            <View key={i} style={style} />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Which edges (or the whole frame) a touch at (px, py) grabs. */
function grabMode(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  "worklet";
  const withinX = px > x - HIT && px < x + w + HIT;
  const withinY = py > y - HIT && py < y + h + HIT;
  let m = 0;
  if (withinY && Math.abs(px - x) < HIT) m |= LEFT;
  if (withinY && Math.abs(px - (x + w)) < HIT) m |= RIGHT;
  if (withinX && Math.abs(py - y) < HIT) m |= TOP;
  if (withinX && Math.abs(py - (y + h)) < HIT) m |= BOTTOM;
  if (m === 0 && px > x && px < x + w && py > y && py < y + h) m = MOVE;
  return m;
}

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function fitContain(
  image: { width: number; height: number },
  box: LayoutRectangle,
) {
  const scale = Math.min(
    (box.width - PAD * 2) / image.width,
    (box.height - PAD * 2) / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    scale,
    width,
    height,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const DIM = {
  position: "absolute",
  backgroundColor: "rgba(0,0,0,0.6)",
} as const;
const FRAME = {
  position: "absolute",
  borderWidth: 1,
  borderColor: "#FFFFFF",
  // A dark halo keeps the white frame visible on white paper too.
  shadowColor: "#000000",
  shadowOpacity: 0.7,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 0 },
} as const;
const LINE = "rgba(140,140,140,0.6)";
const GRID = [
  {
    position: "absolute",
    left: "33.3%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: LINE,
  },
  {
    position: "absolute",
    left: "66.6%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: LINE,
  },
  {
    position: "absolute",
    top: "33.3%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE,
  },
  {
    position: "absolute",
    top: "66.6%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE,
  },
] as const;
const CORNER = {
  position: "absolute",
  width: 26,
  height: 26,
  borderColor: "#FFFFFF",
  shadowColor: "#000000",
  shadowOpacity: 0.7,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 0 },
} as const;
const CORNERS = [
  { ...CORNER, left: -3, top: -3, borderLeftWidth: 4, borderTopWidth: 4 },
  { ...CORNER, right: -3, top: -3, borderRightWidth: 4, borderTopWidth: 4 },
  { ...CORNER, left: -3, bottom: -3, borderLeftWidth: 4, borderBottomWidth: 4 },
  {
    ...CORNER,
    right: -3,
    bottom: -3,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CropFrameHandle {
  crop: () => PixelRect;
}

interface CropFrameProps {
  uri: string;
  imageSize: { width: number; height: number };
  /** Photo pixels; the frame starts here instead of the default inset. */
  initialCrop?: PixelRect;
  ref: Ref<CropFrameHandle>;
}
