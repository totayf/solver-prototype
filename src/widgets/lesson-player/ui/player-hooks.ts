import { type RefObject, useEffect, useState } from "react";

import { needsFrame, type RenderSchedule } from "../lib/timeline";
import { loadPlayerFonts } from "./player-fonts";

/**
 * Reads the media position every frame while playing (the `timeupdate`
 * event fires only ~4×/s, too coarse for drawing on the spoken word), and
 * only when something on screen changes: between drawings the frame is
 * identical, so no state update (and no React render) happens. Paused, the
 * loop stops; seeking or playing restarts it.
 */
export function useMediaClock(
  mediaRef: RefObject<HTMLMediaElement | null>,
  schedule: RenderSchedule,
  onTick: (ms: number) => void,
) {
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    let frame = 0;
    let rendered = -1;

    const sync = () => {
      const ms = Math.round(media.currentTime * 1000);
      if (rendered < 0 || needsFrame(schedule, rendered, ms)) {
        rendered = ms;
        onTick(ms);
      }
    };
    const loop = () => {
      sync();
      frame = media.paused || media.ended ? 0 : requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };

    for (const event of CLOCK_EVENTS) media.addEventListener(event, kick);
    kick();
    return () => {
      cancelAnimationFrame(frame);
      for (const event of CLOCK_EVENTS) media.removeEventListener(event, kick);
    };
  }, [mediaRef, schedule, onTick]);
}

/**
 * The teacher starts talking as soon as the narration can play (and the pen
 * font is in). If the platform refuses unprompted playback, a start button
 * is shown instead — a tap always counts as permission.
 */
export function useAutoplay(
  mediaRef: RefObject<HTMLMediaElement | null>,
  ready: boolean,
) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // play() also kicks off loading; iOS doesn't preload media on its own,
    // so waiting for "canplay" first would wait forever.
    mediaRef.current?.play().catch(() => setBlocked(true));
  }, [mediaRef, ready]);

  const start = () => {
    setBlocked(false);
    void mediaRef.current?.play();
  };

  return { blocked, start };
}

/** True once the pen font is loaded (or the short timeout passed). */
export function usePlayerFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadPlayerFonts().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/**
 * Whether the narration failed: a media `error`, or a `stalled`/`waiting`
 * that doesn't recover within a few seconds while it should be playing.
 */
export function useMediaFailure(
  mediaRef: RefObject<HTMLMediaElement | null>,
  src: string,
) {
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arm for each new source
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    setFailed(Boolean(media.error));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onError = () => {
      clear();
      setFailed(true);
    };
    const onStall = () => {
      clear();
      timer = setTimeout(() => {
        if (!media.paused && media.readyState < HAVE_FUTURE_DATA) {
          setFailed(true);
        }
      }, STALL_MS);
    };
    const onProgress = () => clear();

    media.addEventListener("error", onError);
    for (const event of STALL_EVENTS) media.addEventListener(event, onStall);
    for (const event of OK_EVENTS) media.addEventListener(event, onProgress);
    return () => {
      clear();
      media.removeEventListener("error", onError);
      for (const event of STALL_EVENTS)
        media.removeEventListener(event, onStall);
      for (const event of OK_EVENTS)
        media.removeEventListener(event, onProgress);
    };
  }, [mediaRef, src]);

  return [failed, setFailed] as const;
}

/** Ended state (for the end card); cleared as soon as playback or seeking resumes. */
export function useEnded(mediaRef: RefObject<HTMLMediaElement | null>) {
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onEnded = () => setEnded(true);
    const onResume = () => setEnded(false);
    media.addEventListener("ended", onEnded);
    media.addEventListener("play", onResume);
    media.addEventListener("seeking", onResume);
    return () => {
      media.removeEventListener("ended", onEnded);
      media.removeEventListener("play", onResume);
      media.removeEventListener("seeking", onResume);
    };
  }, [mediaRef]);
  return ended;
}

/** The OS "reduce motion" setting as the WebView reports it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matches(REDUCED_MOTION));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(REDUCED_MOTION);
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matches(query: string): boolean {
  return (
    typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches)
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const CLOCK_EVENTS = [
  "play",
  "playing",
  "seeking",
  "seeked",
  "timeupdate",
  "loadedmetadata",
  "ratechange",
] as const;
const STALL_EVENTS = ["stalled", "waiting"] as const;
const OK_EVENTS = ["playing", "canplay", "progress", "timeupdate"] as const;
const STALL_MS = 12_000;
const HAVE_FUTURE_DATA = 3;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
