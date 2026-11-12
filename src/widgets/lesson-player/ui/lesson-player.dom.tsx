"use dom";

import "@videojs/react/video/skin.css";

import { Gesture } from "@videojs/react";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";
import type { DOMProps } from "expo/dom";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import type { Lesson } from "@/entities/lesson";

import { flattenActions, sceneAt } from "../lib/timeline";
import { LessonBoard } from "./lesson-board";
import { LessonStage } from "./lesson-stage";
import { LessonTopBar } from "./lesson-top-bar";
import { PLAYER_CSS, PLAYER_STYLESHEETS } from "./player-styles";

/**
 * The lesson "video" in Video.js's own skin. The narration plays through a
 * <video> element (audio-only), the stage is layered on top as the picture,
 * and the media clock is the single source of truth — seeking and speed
 * changes all reduce to "what has been drawn by now".
 */
export default function LessonPlayerDom({
  lesson,
  origin,
  onExit,
}: LessonPlayerDomProps) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);

  useStylesheets(PLAYER_STYLESHEETS);
  useMediaClock(mediaRef, setTimeMs);
  const autoplay = useAutoplay(mediaRef);

  // Per lesson, not per frame: the clock re-renders this ~60 times a second.
  const actions = useMemo(() => flattenActions(lesson), [lesson]);
  const scene = sceneAt(actions, timeMs);

  return (
    <VideoPlayer>
      <style>{PLAYER_CSS}</style>
      <VideoSkin className="lesson-skin">
        <Video
          ref={mediaRef}
          src={mediaSrc(origin, lesson.audio.url)}
          preload="auto"
          playsInline
        ></Video>

        <div className="workspace">
          <LessonStage
            lesson={lesson}
            imageUrl={mediaSrc(origin, lesson.image.url)}
            scene={scene}
            timeMs={timeMs}
          />
          <LessonBoard lesson={lesson} scene={scene} timeMs={timeMs} />
        </div>

        {/* The skin's touch tap only toggles the controls; in a lesson a tap
            should also pause and resume, like tapping a teacher's video. */}
        <Gesture type="tap" action="togglePaused" pointer="touch" />

        <LessonTopBar onExit={onExit} />

        {autoplay.blocked && (
          <div className="start">
            <button
              type="button"
              className="start-button"
              onClick={autoplay.start}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5.5v13a1 1 0 001.5.86l10.4-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" />
              </svg>
              Dersi başlat
            </button>
          </div>
        )}
      </VideoSkin>
    </VideoPlayer>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cloud lessons carry absolute media URLs; local ones are relative to the API. */
function mediaSrc(origin: string, url: string): string {
  return /^https?:\/\//.test(url) ? url : origin + url;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * The teacher starts talking as soon as the narration can play. If the
 * platform refuses unprompted playback (some browsers do), a start button is
 * shown instead — a tap always counts as permission.
 */
function useAutoplay(mediaRef: RefObject<HTMLMediaElement | null>) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // play() also kicks off loading; iOS doesn't preload media on its own,
    // so waiting for "canplay" first would wait forever.
    mediaRef.current?.play().catch(() => setBlocked(true));
  }, [mediaRef]);

  const start = () => {
    setBlocked(false);
    void mediaRef.current?.play();
  };

  return { blocked, start };
}

/**
 * Reads the media position every frame. The `timeupdate` event fires only
 * ~4×/s, too coarse for drawing on the exact word being spoken.
 */
function useMediaClock(
  mediaRef: RefObject<HTMLMediaElement | null>,
  onTick: (ms: number) => void,
) {
  useEffect(() => {
    let frame = 0;
    let last = -1;
    const tick = () => {
      const ms = Math.round((mediaRef.current?.currentTime ?? 0) * 1000);
      if (Math.abs(ms - last) >= 10) {
        last = ms;
        onTick(ms);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mediaRef, onTick]);
}

function useStylesheets(hrefs: string[]) {
  useEffect(() => {
    const links = hrefs.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.append(link);
      return link;
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [hrefs]);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LessonPlayerDomProps {
  lesson: Lesson;
  /** Origin of the API routes (empty on web, the dev server on native). */
  origin: string;
  onExit: () => Promise<void>;
  dom?: DOMProps;
}
