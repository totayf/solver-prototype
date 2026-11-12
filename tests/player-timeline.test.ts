import { describe, expect, test } from "bun:test";

import type {
  Lesson,
  LessonAction,
  LessonStep,
} from "../src/entities/lesson/model/types";
import {
  buildCaptions,
  captionAt,
} from "../src/widgets/lesson-player/lib/captions";
import {
  activeStroke,
  buildInkPlan,
  type InkPlan,
  inkPlan,
  maxInkSpanMs,
  type PathMeasure,
  penTip,
  strokeProgress,
} from "../src/widgets/lesson-player/lib/ink";
import {
  chapters,
  flattenActions,
  needsFrame,
  renderSchedule,
  shorten,
  stepIndexAt,
} from "../src/widgets/lesson-player/lib/timeline";

/** Every path is 100 long and runs from (0,0) to (100,0). */
const fakeMeasure: PathMeasure = {
  length: () => 100,
  pointAt: (_d, t) => ({ x: 100 * t, y: 0 }),
};

function plan(lengths: number[], startMs = 0, endMs = 1000): InkPlan {
  const before: number[] = [];
  let total = 0;
  for (const length of lengths) {
    before.push(total);
    total += length;
  }
  return {
    strokes: lengths.map((length) => ({
      d: "M0 0",
      kind: "ink" as const,
      width: 3,
      color: "red" as const,
      length,
    })),
    before,
    totalLength: total,
    startMs,
    endMs,
    start: { x: 0, y: 0 },
    rest: { x: 9, y: 9 },
  };
}

const rect = { x: 10, y: 10, width: 200, height: 30 };
const underline = (atMs: number, endMs?: number): LessonAction => ({
  type: "underline",
  atMs,
  color: "red",
  rects: [rect],
  endMs,
});

function step(
  startMs: number,
  durationMs: number,
  narration: string,
  actions: LessonAction[] = [],
  timed = true,
): LessonStep {
  const tokens = narration.split(" ");
  const each = durationMs / tokens.length;
  return {
    narration,
    startMs,
    durationMs,
    actions,
    words: timed
      ? tokens.map((text, i) => ({
          text,
          startMs: startMs + i * each,
          endMs: startMs + (i + 1) * each,
        }))
      : [],
  };
}

function lesson(steps: LessonStep[], id = "L1"): Lesson {
  return {
    id,
    title: "T",
    answer: "C",
    tools: [],
    image: { url: "/i", width: 1000, height: 800 },
    audio: { url: "/a", durationMs: 60_000 },
    figures: [],
    steps,
  };
}

describe("ink plan", () => {
  test("cumulative lengths and touch-down / rest points are precomputed", () => {
    const built = buildInkPlan("0-0", underline(1000), fakeMeasure);
    expect(built.before[0]).toBe(0);
    expect(built.totalLength).toBe(100 * built.strokes.length);
    expect(built.start).toEqual({ x: 0, y: 0 });
    expect(built.rest).toEqual({ x: 100, y: 0 });
    expect(built.startMs).toBe(1180);
    expect(built.endMs - built.startMs).toBeGreaterThanOrEqual(280);
  });

  test("strokes are drawn one after another", () => {
    const p = plan([100, 300]);
    expect(strokeProgress(p, 0.125, 0)).toBe(0.5);
    expect(strokeProgress(p, 0.125, 1)).toBe(0);
    expect(strokeProgress(p, 0.625, 1)).toBeCloseTo(0.5);
    expect(activeStroke(p, 0.125)).toEqual({ index: 0, drawn: 0.5 });
    expect(activeStroke(p, 0.625).index).toBe(1);
    expect(activeStroke(p, 1)).toEqual({ index: 2, drawn: 1 });
  });

  test("pen glides from the previous rest point, then rests, then is put away", () => {
    const previous = plan([100], 0, 500);
    const current = plan([100], 1000, 2000);
    const gliding = penTip(current, previous, null, 1000 - 90, fakeMeasure);
    expect(gliding?.x).toBeGreaterThan(0);
    expect(gliding?.x).toBeLessThan(9);
    expect(penTip(current, previous, null, 1500, fakeMeasure)).toEqual({
      x: 50,
      y: 0,
    });
    expect(penTip(current, null, null, 2500, fakeMeasure)).toEqual({
      x: 9,
      y: 9,
    });
    expect(penTip(current, null, null, 2000 + 1401, fakeMeasure)).toBeNull();
  });

  test("the plan cache is per lesson: same action key, different lesson", () => {
    // Uses the DOM measurer only on a miss; seed the cache through two
    // lessons whose action keys collide and check they don't share plans.
    const globalWithDocument = globalThis as { document?: unknown };
    const hadDocument = "document" in globalWithDocument;
    const elements: Array<Record<string, unknown>> = [];
    globalWithDocument.document ??= {
      createElementNS: () => {
        const element: Record<string, unknown> = {
          attrs: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            (element.attrs as Record<string, string>)[name] = value;
          },
          getAttribute(name: string) {
            return (element.attrs as Record<string, string>)[name] ?? null;
          },
          append: () => undefined,
          getTotalLength: () => 50,
          getPointAtLength: (length: number) => ({ x: length, y: 0 }),
        };
        elements.push(element);
        return element;
      },
      body: { append: () => undefined },
    };
    try {
      const a = inkPlan("lesson-a", "0-0", underline(0));
      const b = inkPlan("lesson-b", "0-0", underline(5000));
      expect(a.startMs).toBe(180);
      expect(b.startMs).toBe(5180);
      expect(inkPlan("lesson-b", "0-0", underline(5000))).toBe(b);
    } finally {
      if (!hadDocument) delete globalWithDocument.document;
    }
  });
});

describe("render schedule", () => {
  const actions = flattenActions(
    lesson([
      step(0, 20_000, "bir iki üç", [
        underline(2000),
        underline(10_000, 12_000),
      ]),
    ]),
  );
  const schedule = renderSchedule(actions, [15_000]);

  test("renders while the pen is moving or a mark fades", () => {
    expect(needsFrame(schedule, 2100, 2116)).toBe(true);
    expect(needsFrame(schedule, 12_100, 12_116)).toBe(true);
  });

  test("skips frames while nothing moves", () => {
    const quietFrom = 2000 + maxInkSpanMs(underline(0)) + 10;
    expect(needsFrame(schedule, quietFrom, quietFrom + 16)).toBe(false);
    expect(needsFrame(schedule, 5000, 5000)).toBe(false);
  });

  test("passing a mark or seeking back always renders", () => {
    expect(needsFrame(schedule, 14_990, 15_006)).toBe(true);
    expect(needsFrame(schedule, 9000, 3000)).toBe(true);
    // A jump over a whole drawing still lands one frame.
    expect(needsFrame(schedule, 6000, 19_000)).toBe(true);
  });
});

describe("chapters and captions", () => {
  const steps = [
    step(0, 4000, "Önce soruyu okuyalım. Sonra şıklara bakalım."),
    step(5000, 3000, "Cevap C."),
    step(9000, 2000, "Zamanlaması olmayan adım", [], false),
  ];
  const l = lesson(steps);

  test("step lookup finds the step being narrated", () => {
    expect(stepIndexAt(steps, 0)).toBe(0);
    expect(stepIndexAt(steps, 4999)).toBe(0);
    expect(stepIndexAt(steps, 5000)).toBe(1);
    expect(stepIndexAt(steps, 99_999)).toBe(2);
    expect(stepIndexAt([], 10)).toBe(-1);
  });

  test("chapters start at each step with a short label", () => {
    const list = chapters(l);
    expect(list.map((c) => c.startMs)).toEqual([0, 5000, 9000]);
    expect(list[1].label).toBe("Cevap C.");
    expect(shorten("bir iki üç dört beş altı yedi", 12)).toBe("bir iki üç…");
  });

  test("captions follow sentences and the spoken words", () => {
    const lines = buildCaptions(l);
    expect(lines.map((line) => line.text)).toEqual([
      "Önce soruyu okuyalım.",
      "Sonra şıklara bakalım.",
      "Cevap C.",
      "Zamanlaması olmayan adım",
    ]);
    expect(captionAt(lines, 100)?.text).toBe("Önce soruyu okuyalım.");
    expect(captionAt(lines, 3000)?.text).toBe("Sonra şıklara bakalım.");
    expect(captionAt(lines, 4500)).toBeNull();
    expect(captionAt(lines, 9500)?.text).toBe("Zamanlaması olmayan adım");
  });

  test("long sentences are cut into readable lines", () => {
    const words = Array.from({ length: 30 }, (_, i) => `k${i}`).join(" ");
    const lines = buildCaptions(lesson([step(0, 30_000, words)]));
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => line.text.split(" ").length <= 12)).toBe(true);
  });
});
