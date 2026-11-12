import { describe, expect, test } from "bun:test";

import {
  capHistory,
  droppedUploads,
  type LessonHistoryEntry,
  MAX_ENTRIES,
  normalizeHistory,
  pendingEntries,
  withFailed,
  withoutEntry,
  withPending,
  withReady,
  withStage,
} from "../src/entities/lesson/model/history-model";

const lesson = (id: string, title = "Matematik / Kümeler", answer = "C") => ({
  id,
  title,
  answer,
  audio: { url: "/a", durationMs: 95_000 },
});

describe("lesson history", () => {
  test("old entries (no status) load as ready, junk is dropped", () => {
    const history = normalizeHistory([
      { id: "a", title: "T 1", answer: "B", durationMs: 1000, createdAt: 5 },
      { nope: true },
      "x",
      { id: "p", status: "pending", stage: "solving", createdAt: 7 },
    ]);
    expect(history).toEqual([
      {
        id: "a",
        status: "ready",
        title: "T 1",
        answer: "B",
        durationMs: 1000,
        createdAt: 5,
      },
      {
        id: "p",
        status: "pending",
        stage: "solving",
        createdAt: 7,
        uploadUri: undefined,
      },
    ]);
    expect(normalizeHistory("garbage")).toEqual([]);
  });

  test("a 202 goes to the top as pending and survives as a pending entry", () => {
    const start: LessonHistoryEntry[] = withReady([], lesson("old"), 1);
    const history = withPending(start, {
      id: "new",
      stage: "reading",
      createdAt: 10,
      uploadUri: "file:///u/new.jpg",
    });
    expect(history[0]).toMatchObject({ id: "new", status: "pending" });
    expect(pendingEntries(history).map((e) => e.id)).toEqual(["new"]);
  });

  test("joining a running job keeps its start; a ready one stays ready", () => {
    let history = withPending([], { id: "j", stage: "reading", createdAt: 10 });
    history = withPending(history, {
      id: "j",
      stage: "solving",
      createdAt: 99,
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ createdAt: 10, stage: "solving" });

    const ready = withReady(history, lesson("j"));
    expect(
      withPending(ready, { id: "j", stage: "reading", createdAt: 5 })[0],
    ).toMatchObject({ status: "ready" });
  });

  test("stage updates write only when something changed", () => {
    const history = withPending([], {
      id: "s",
      stage: "reading",
      createdAt: 1,
    });
    expect(withStage(history, "s", "reading")).toBe(history);
    expect(withStage(history, "missing", "solving")).toBe(history);
    expect(withStage(history, "s", "writing")[0]).toMatchObject({
      stage: "writing",
    });
  });

  test("ready keeps the place and date, numbers repeated topics", () => {
    let history = withReady([], lesson("a"), 1);
    history = withPending(history, { id: "b", stage: "voicing", createdAt: 2 });
    history = withReady(history, lesson("b"), 3);
    expect(history.map((e) => e.id)).toEqual(["b", "a"]);
    expect(history[0]).toMatchObject({
      status: "ready",
      createdAt: 2,
      title: "Matematik / Kümeler 2",
    });
    // Already ready: no write.
    expect(withReady(history, lesson("b"))).toBe(history);
  });

  test("failed keeps the photo for a retry; a retry replaces the failed row", () => {
    let history = withPending([], {
      id: "f",
      stage: "solving",
      createdAt: 1,
      uploadUri: "file:///u/f.jpg",
    });
    const error = {
      kind: "failed" as const,
      message: "Bu soruda emin olamadım.",
    };
    history = withFailed(history, "f", error);
    expect(history[0]).toEqual({
      id: "f",
      createdAt: 1,
      status: "failed",
      error,
      uploadUri: "file:///u/f.jpg",
    });
    expect(withFailed(history, "f", { ...error })).toBe(history);

    const retried = withPending(history, {
      id: "g",
      stage: "reading",
      createdAt: 5,
      uploadUri: "file:///u/g.jpg",
      replaces: "f",
    });
    expect(retried.map((e) => e.id)).toEqual(["g"]);
    expect(droppedUploads(history, retried)).toEqual(["file:///u/f.jpg"]);
  });

  test("a ready lesson no longer needs its photo copy", () => {
    const pending = withPending([], {
      id: "r",
      stage: "voicing",
      createdAt: 1,
      uploadUri: "file:///u/r.jpg",
    });
    const ready = withReady(pending, lesson("r"));
    expect(droppedUploads(pending, ready)).toEqual(["file:///u/r.jpg"]);
    expect(withoutEntry(ready, "r")).toEqual([]);
    expect(withoutEntry(ready, "nope")).toBe(ready);
  });

  test("the cap never drops a lesson that is still being made", () => {
    const pending = withPending([], {
      id: "p",
      stage: "reading",
      createdAt: 0,
    });
    let history = [...pending];
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      history.push(...withReady([], lesson(`r${i}`), i));
    }
    history = capHistory(history);
    expect(history).toHaveLength(MAX_ENTRIES);
    expect(history.some((e) => e.id === "p")).toBe(true);
  });
});
