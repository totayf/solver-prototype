import { isTransientError } from "@/shared/api/friendly-error";

import { TOO_LONG } from "./lesson-state";
import type { LessonState } from "./types";

/**
 * Polls lessons that are still being generated, one loop per id, until each
 * is ready or failed. Timing: every 1.5 s for the first 30 s, then every
 * 3 s; temporary failures (offline, 503) back off up to 15 s. At the deadline
 * one last poll decides. Pausing (app in background) stops timers and
 * in-flight requests; resuming polls everything at once.
 *
 * Side effects are injected (`fetchState`, `onState`, timers) so the
 * schedule is testable without a network or React.
 */
export function createLessonPoller(deps: PollerDeps): LessonPoller {
  const watched = new Map<string, Watch>();
  let paused = false;

  const schedule = (watch: Watch, delayMs: number) => {
    clear(watch);
    if (paused) return;
    watch.timer = deps.setTimer(() => void poll(watch), delayMs);
  };

  const poll = async (watch: Watch) => {
    watch.timer = null;
    if (paused || watched.get(watch.id) !== watch || watch.controller) return;
    const controller = new AbortController();
    watch.controller = controller;
    let outcome: PollOutcome;
    try {
      outcome = {
        kind: "state",
        state: await deps.fetchState(watch.id, controller.signal),
      };
    } catch (error) {
      outcome = { kind: "error", error };
    } finally {
      watch.controller = null;
    }
    // Unwatched, paused or superseded while the request was out.
    if (controller.signal.aborted || watched.get(watch.id) !== watch) return;

    const decision = decidePoll({
      outcome,
      elapsedMs: deps.now() - watch.createdAt,
      failures: watch.failures,
    });
    if (outcome.kind === "state" && outcome.state.status === "pending") {
      deps.onState(watch.id, outcome.state);
    }
    switch (decision.kind) {
      case "done":
        watched.delete(watch.id);
        deps.onState(watch.id, decision.state);
        return;
      case "stop":
        // Offline past the deadline: stay pending until the app is back.
        watched.delete(watch.id);
        return;
      case "wait":
        watch.failures = decision.failures;
        schedule(watch, decision.delayMs);
    }
  };

  return {
    watch({ id, createdAt }) {
      if (watched.has(id)) return;
      const watch: Watch = {
        id,
        createdAt,
        failures: 0,
        timer: null,
        controller: null,
      };
      watched.set(id, watch);
      schedule(watch, 0);
    },
    unwatch(id) {
      const watch = watched.get(id);
      if (!watch) return;
      watched.delete(id);
      clear(watch);
      watch.controller?.abort();
    },
    isWatching: (id) => watched.has(id),
    pause() {
      paused = true;
      for (const watch of watched.values()) {
        clear(watch);
        watch.controller?.abort();
        watch.controller = null;
      }
    },
    resume() {
      paused = false;
      for (const watch of watched.values()) {
        watch.failures = 0;
        if (!watch.controller) schedule(watch, 0);
      }
    },
  };

  function clear(watch: Watch) {
    if (watch.timer !== null) deps.clearTimer(watch.timer);
    watch.timer = null;
  }
}

/**
 * What to do after one poll. Pure: the whole schedule is decided here.
 * - ready / failed → done
 * - pending → wait (the deadline is polled once more exactly; still pending
 *   then → failed "took too long")
 * - temporary error → wait with backoff; past the deadline → stop polling
 *   but keep the lesson pending (it may well be ready; the next app start or
 *   return to the app checks again)
 * - any other error → failed
 */
export function decidePoll({
  outcome,
  elapsedMs,
  failures,
}: {
  outcome: PollOutcome;
  elapsedMs: number;
  failures: number;
}): PollDecision {
  if (outcome.kind === "state") {
    const { state } = outcome;
    if (state.status !== "pending") return { kind: "done", state };
    if (elapsedMs >= POLL_DEADLINE_MS) {
      return {
        kind: "done",
        state: { status: "failed", id: state.id, error: TOO_LONG },
      };
    }
    return {
      kind: "wait",
      failures: 0,
      delayMs: untilDeadline(pollDelayMs(elapsedMs, 0), elapsedMs),
    };
  }

  if (isTransientError(outcome.error)) {
    if (elapsedMs >= POLL_DEADLINE_MS) return { kind: "stop" };
    const next = failures + 1;
    return {
      kind: "wait",
      failures: next,
      delayMs: untilDeadline(pollDelayMs(elapsedMs, next), elapsedMs),
    };
  }
  // fetchState turns final errors into failed states; anything else is a bug
  // or an answer we don't understand — stop and let the student retry.
  return { kind: "stop" };
}

/** 1.5 s for the first 30 s, then 3 s; doubled per failed poll, at most 15 s. */
export function pollDelayMs(elapsedMs: number, failures: number): number {
  const base = elapsedMs < FAST_PHASE_MS ? FAST_POLL_MS : SLOW_POLL_MS;
  return Math.min(MAX_POLL_MS, base * 2 ** Math.max(0, failures));
}

// ── Constants ────────────────────────────────────────────────────────────────

export const FAST_POLL_MS = 1_500;
export const SLOW_POLL_MS = 3_000;
export const FAST_PHASE_MS = 30_000;
const MAX_POLL_MS = 15_000;
/** Generation takes about two minutes; the server gives up well within this. */
export const POLL_DEADLINE_MS = 8 * 60_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Never sleep past the deadline: the last poll lands on it. */
function untilDeadline(delayMs: number, elapsedMs: number): number {
  return Math.max(0, Math.min(delayMs, POLL_DEADLINE_MS - elapsedMs));
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PollerDeps {
  /** One GET; resolves to the lesson's state, throws only temporary errors. */
  fetchState: (id: string, signal: AbortSignal) => Promise<LessonState>;
  /** Every pending update and the final state. */
  onState: (id: string, state: LessonState) => void;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

export interface LessonPoller {
  /** Starts polling (no-op when already watched). `createdAt` sets the deadline. */
  watch: (lesson: { id: string; createdAt: number }) => void;
  unwatch: (id: string) => void;
  isWatching: (id: string) => boolean;
  pause: () => void;
  /** Polls every watched lesson right away. */
  resume: () => void;
}

export type PollOutcome =
  | { kind: "state"; state: LessonState }
  | { kind: "error"; error: unknown };

export type PollDecision =
  | { kind: "done"; state: LessonState }
  | { kind: "wait"; delayMs: number; failures: number }
  | { kind: "stop" };

interface Watch {
  id: string;
  createdAt: number;
  failures: number;
  timer: unknown;
  controller: AbortController | null;
}
