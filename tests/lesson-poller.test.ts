import { describe, expect, test } from "bun:test";

import {
  createLessonPoller,
  decidePoll,
  FAST_POLL_MS,
  POLL_DEADLINE_MS,
  pollDelayMs,
  SLOW_POLL_MS,
} from "../src/entities/lesson/model/lesson-poller";
import {
  stateFromBody,
  stateFromError,
} from "../src/entities/lesson/model/lesson-state";
import type { LessonState } from "../src/entities/lesson/model/types";
import { NetworkError, RequestError } from "../src/shared/api/errors";

const pending: LessonState = { status: "pending", id: "l1", stage: "solving" };
const ready = {
  status: "ready",
  lesson: { id: "l1" },
} as unknown as LessonState;

describe("poll schedule", () => {
  test("1.5 s for the first 30 s, then 3 s, backing off on failures", () => {
    expect(pollDelayMs(0, 0)).toBe(FAST_POLL_MS);
    expect(pollDelayMs(29_999, 0)).toBe(FAST_POLL_MS);
    expect(pollDelayMs(30_000, 0)).toBe(SLOW_POLL_MS);
    expect(pollDelayMs(60_000, 1)).toBe(6_000);
    expect(pollDelayMs(60_000, 10)).toBe(15_000);
  });

  test("pending keeps waiting; the last wait lands on the deadline", () => {
    expect(
      decidePoll({
        outcome: { kind: "state", state: pending },
        elapsedMs: 1000,
        failures: 0,
      }),
    ).toEqual({ kind: "wait", delayMs: FAST_POLL_MS, failures: 0 });
    expect(
      decidePoll({
        outcome: { kind: "state", state: pending },
        elapsedMs: POLL_DEADLINE_MS - 1000,
        failures: 0,
      }),
    ).toEqual({ kind: "wait", delayMs: 1000, failures: 0 });
  });

  test("still pending at the deadline fails with a friendly message", () => {
    const decision = decidePoll({
      outcome: { kind: "state", state: pending },
      elapsedMs: POLL_DEADLINE_MS,
      failures: 0,
    });
    expect(decision.kind).toBe("done");
    if (decision.kind === "done" && decision.state.status === "failed") {
      expect(decision.state.error.message).toContain("beklenenden uzun");
    } else throw new Error("expected failed");
  });

  test("ready and failed finish polling", () => {
    expect(
      decidePoll({
        outcome: { kind: "state", state: ready },
        elapsedMs: 5,
        failures: 0,
      }),
    ).toEqual({ kind: "done", state: ready });
  });

  test("offline keeps polling with backoff, and stops (still pending) past the deadline", () => {
    const offline = {
      kind: "error" as const,
      error: new NetworkError("offline"),
    };
    expect(
      decidePoll({ outcome: offline, elapsedMs: 40_000, failures: 1 }),
    ).toEqual({
      kind: "wait",
      delayMs: 12_000,
      failures: 2,
    });
    expect(
      decidePoll({
        outcome: offline,
        elapsedMs: POLL_DEADLINE_MS + 1,
        failures: 0,
      }),
    ).toEqual({ kind: "stop" });
  });
});

describe("lesson state", () => {
  test("202 body is pending, 200 body is ready", () => {
    expect(
      stateFromBody("x", { id: "x", status: "pending", stage: "voicing" }),
    ).toEqual({ status: "pending", id: "x", stage: "voicing" });
    expect(
      stateFromBody("x", { id: "x", status: "pending", stage: "??" as never }),
    ).toMatchObject({ stage: "reading" });
    expect(stateFromBody("x", { id: "x" } as never).status).toBe("ready");
  });

  test("404 is gone, a refusal keeps its sentence, temporary errors throw", () => {
    expect(
      stateFromError("x", new RequestError(404, "not found", true)),
    ).toEqual({
      status: "failed",
      id: "x",
      error: { kind: "gone", message: "Bu ders artık yok." },
    });
    expect(
      stateFromError(
        "x",
        new RequestError(500, "Fotoğraf net değil, tekrar çek.", true),
      ),
    ).toMatchObject({
      error: { kind: "failed", message: "Fotoğraf net değil, tekrar çek." },
    });
    expect(() =>
      stateFromError("x", new RequestError(503, null, false)),
    ).toThrow();
    expect(() => stateFromError("x", new NetworkError("timeout"))).toThrow();
  });
});

describe("createLessonPoller", () => {
  function harness(answers: Array<LessonState | Error>) {
    let clock = 0;
    const timers: Array<{ at: number; run: () => void; id: number }> = [];
    let nextId = 0;
    const states: LessonState[] = [];
    let calls = 0;
    const poller = createLessonPoller({
      fetchState: async () => {
        const answer = answers[Math.min(calls++, answers.length - 1)];
        if (answer instanceof Error) throw answer;
        return answer;
      },
      onState: (_id, state) => states.push(state),
      now: () => clock,
      setTimer: (run, ms) => {
        const timer = { at: clock + ms, run, id: nextId++ };
        timers.push(timer);
        return timer.id;
      },
      clearTimer: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const advance = async () => {
      timers.sort((a, b) => a.at - b.at);
      const timer = timers.shift();
      if (!timer) return false;
      clock = timer.at;
      timer.run();
      await Bun.sleep(0);
      return true;
    };
    return {
      poller,
      states,
      advance,
      timers,
      calls: () => calls,
      now: () => clock,
    };
  }

  test("polls until ready, reports stages, then stops", async () => {
    const h = harness([pending, pending, new NetworkError("offline"), ready]);
    h.poller.watch({ id: "l1", createdAt: 0 });
    while (await h.advance()) continue;
    expect(h.states.map((s) => s.status)).toEqual([
      "pending",
      "pending",
      "ready",
    ]);
    expect(h.poller.isWatching("l1")).toBe(false);
    expect(h.calls()).toBe(4);
  });

  test("pause stops polling; resume polls at once", async () => {
    const h = harness([pending]);
    h.poller.watch({ id: "l1", createdAt: 0 });
    await h.advance();
    expect(h.timers).toHaveLength(1);
    h.poller.pause();
    expect(h.timers).toHaveLength(0);
    h.poller.resume();
    expect(h.timers[0]?.at).toBe(h.now());
    h.poller.unwatch("l1");
    expect(h.timers).toHaveLength(0);
  });

  test("watching the same lesson twice runs one loop", async () => {
    const h = harness([pending]);
    h.poller.watch({ id: "l1", createdAt: 0 });
    h.poller.watch({ id: "l1", createdAt: 0 });
    expect(h.timers).toHaveLength(1);
  });

  test("a lesson resumed long after its deadline gets one last poll", async () => {
    const h = harness([pending]);
    h.poller.watch({ id: "l1", createdAt: -POLL_DEADLINE_MS * 3 });
    while (await h.advance()) continue;
    expect(h.calls()).toBe(1);
    expect(h.states.at(-1)?.status).toBe("failed");
  });
});
