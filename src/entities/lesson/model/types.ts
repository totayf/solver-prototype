/**
 * A finished lesson as the player consumes it: one narration track, steps
 * placed on it, and annotation actions already resolved to image rectangles,
 * board drawings already laid out, and everything placed at absolute times.
 * Shared by the server (producer) and the app (player).
 */
export interface Lesson {
  id: string;
  title: string;
  /** Correct option letter, or the result of an open question. */
  answer: string;
  /** Tools the lesson really shows: board figure kinds, plus "code" for a shown program check. */
  tools: string[];
  image: { url: string; width: number; height: number };
  audio: { url: string; durationMs: number };
  /** Board figures in the order they first appear (sizes in board units). */
  figures: FigureLayout[];
  steps: LessonStep[];
  /** One sentence on the trap students fall into here; shown on the end card. */
  trap?: string;
  /** Extra server data the player doesn't need (models, timings, …). */
  meta?: Record<string, unknown>;
}

export interface LessonStep {
  narration: string;
  startMs: number;
  durationMs: number;
  /** Spoken words on the lesson timeline (absolute ms). */
  words: SpokenWord[];
  actions: LessonAction[];
}

export interface SpokenWord {
  text: string;
  startMs: number;
  endMs: number;
}

export type LessonAction =
  | MarkAction
  | FocusAction
  | ArrowAction
  | WriteAction
  | FigureAction
  | RevealAnswerAction;

export interface MarkAction {
  type: "highlight" | "underline" | "circle" | "strike" | "box";
  atMs: number;
  /** Ignored for highlight, which is always the yellow highlighter. */
  color: PenColor;
  /** One rectangle per visual line the marked span covers. */
  rects: Rect[];
  /** Temporary marks fade out from this time on; permanent ones have none. */
  endMs?: number;
}

export interface FocusAction {
  type: "focus";
  atMs: number;
  /** Region to zoom into; empty means zoom back out to the whole question. */
  rects: Rect[];
}

export interface ArrowAction {
  type: "arrow";
  atMs: number;
  color: PenColor;
  from: Rect;
  to: Rect;
  /** Temporary arrows fade out from this time on. */
  endMs?: number;
}

export type WriteAction = {
  type: "write";
  atMs: number;
  color: PenColor;
  /** Short handwritten note: Unicode math, LaTeX between `$…$` only for real fractions/roots. */
  text: string;
  /** Temporary notes fade out from this time on. */
  endMs?: number;
} & ({ place: "board" } | { place: "question"; anchor: Rect; side: NoteSide });

/**
 * Part of a board drawing (geometry, plot, table, …). A figure is created by
 * its first action; later actions add to it. Parts are drawn in order.
 */
export interface FigureAction {
  type: "figure";
  atMs: number;
  figure: string;
  parts: FigurePart[];
  /** Temporary figure parts fade out from this time on. */
  endMs?: number;
}

export type FigurePart =
  | {
      kind: "path";
      /** SVG path in figure units (width 1000, y down). */
      d: string;
      color: InkColor;
      width: number;
      /** solid: a dot; shade: a translucent area (both traced, then filled). */
      fill?: "solid" | "shade";
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: InkColor;
      size: number;
      anchor: "start" | "middle" | "end";
    };

export interface FigureLayout {
  id: string;
  /** The board kind it was drawn with (construct, map, …). */
  kind: string;
  /** Height in board units; every figure is 1000 units wide. */
  height: number;
}

export interface RevealAnswerAction {
  type: "reveal_answer";
  atMs: number;
  /** choice: an option letter; open: the final result; proof: the proved claim. */
  format: "choice" | "open" | "proof";
  answer: string;
  /** The option's line on the photo (empty without options). */
  rects: Rect[];
}

/** Image-pixel rectangle (origin top-left). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The teacher's pens: red by default, the others only to match or tell items apart. */
export type PenColor = "red" | "blue" | "green" | "purple" | "orange";

/** Board drawings add a neutral "ink" for the figure itself (axes, grid, sides). */
export type InkColor = PenColor | "ink";

export type NoteSide =
  | "auto"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Where a lesson being generated is; the server reports it while the app waits. */
export type GenerationStage = "reading" | "solving" | "writing" | "voicing";

/** What the lesson endpoints answer (HTTP 202) while generation is still running. */
export interface PendingLesson {
  id: string;
  status: "pending";
  stage: GenerationStage;
}

/**
 * A lesson as the app knows it while it may still be generated: the server's
 * stage while it runs, the lesson once it's there, or why it isn't coming
 * (a refusal such as "Bu soruda emin olamadım…", or `gone` for an unknown id).
 * Media URLs inside a ready lesson may be short-lived: refetch, never persist.
 */
export type LessonState =
  | { status: "pending"; id: string; stage: GenerationStage }
  | { status: "ready"; lesson: Lesson }
  | { status: "failed"; id: string; error: LessonFailure };

/** Student-facing reason a lesson won't play (`gone`: the server has no such lesson). */
export interface LessonFailure {
  kind: "gone" | "failed" | "outdated" | "other";
  message: string;
}

/** What a list row needs to show a lesson. */
export interface LessonSummary {
  id: string;
  title: string;
  answer: string;
  durationMs: number;
}
