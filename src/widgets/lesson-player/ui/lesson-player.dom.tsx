"use dom";

import "@videojs/react/video/skin.css";

import { Gesture } from "@videojs/react";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";
import type { DOMProps } from "expo/dom";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import type { Lesson } from "@/entities/lesson";

import { buildCaptions, captionAt, captionMarks } from "../lib/captions";
import {
  type Chapter,
  chapters as chaptersOf,
  flattenActions,
  renderSchedule,
  sceneAt,
  stepIndexAt,
} from "../lib/timeline";
import { KATEX_CSS } from "./katex-css.generated";
import { LessonBoard } from "./lesson-board";
import { LessonStage } from "./lesson-stage";
import { LessonTopBar } from "./lesson-top-bar";
import { PlayerErrorBoundary } from "./player-error-boundary";
import {
  useAutoplay,
  useEnded,
  useMediaClock,
  useMediaFailure,
  usePlayerFonts,
  usePrefersReducedMotion,
} from "./player-hooks";
import {
  CaptionLine,
  ChaptersPanel,
  EndCard,
  MediaProblem,
} from "./player-overlays";
import { PLAYER_CSS } from "./player-styles";

/**
 * The lesson "video" in Video.js's own skin. The narration plays through a
 * <video> element (audio-only), the stage is layered on top as the picture,
 * and the media clock is the single source of truth — seeking and speed
 * changes all reduce to "what has been drawn by now". A crash inside shows
 * a friendly card (and is reported to native) instead of a blank screen.
 */
export default function LessonPlayerDom(props: LessonPlayerDomProps) {
  const exit = () => void props.onExit();
  return (
    <>
      <style>{KATEX_CSS}</style>
      <style>{PLAYER_CSS}</style>
      <PlayerErrorBoundary
        onError={(message) => void props.onError(message)}
        onExit={exit}
      >
        <Player {...props} />
      </PlayerErrorBoundary>
    </>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function Player({
  lesson,
  origin,
  active,
  reduceMotion,
  captionsOn: initialCaptions,
  onCaptionsChange,
  onExit,
  onReloadMedia,
}: LessonPlayerDomProps) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(initialCaptions);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const media = useFreshMedia(lesson, origin, mediaRef, onReloadMedia);

  const fontsReady = usePlayerFonts();
  const autoplay = useAutoplay(mediaRef, fontsReady);
  const ended = useEnded(mediaRef);
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reduceMotion || prefersReduced;

  // Per lesson, not per frame.
  const actions = useMemo(() => flattenActions(lesson), [lesson]);
  const captions = useMemo(() => buildCaptions(lesson), [lesson]);
  const chapters = useMemo(() => chaptersOf(lesson), [lesson]);
  const schedule = useMemo(
    () =>
      renderSchedule(actions, [
        ...captionMarks(captions),
        ...lesson.steps.map((step) => step.startMs),
      ]),
    [actions, captions, lesson.steps],
  );
  useMediaClock(mediaRef, schedule, setTimeMs);

  // The app went to the background: stop talking.
  useEffect(() => {
    if (!active) mediaRef.current?.pause();
  }, [active]);

  // Nothing is drawn until the pen font is in.
  const clock = fontsReady ? timeMs : 0;
  const scene = sceneAt(actions, clock);
  const caption = captionsOn ? captionAt(captions, clock) : null;

  const seekTo = (ms: number) => {
    const element = mediaRef.current;
    if (!element) return;
    element.currentTime = ms / 1000;
    void element.play().catch(() => undefined);
  };
  const toggleCaptions = () => {
    const next = !captionsOn;
    setCaptionsOn(next);
    void onCaptionsChange(next);
  };
  const exit = () => void onExit();

  return (
    <VideoPlayer>
      <VideoSkin
        className={reduced ? "lesson-skin reduce-motion" : "lesson-skin"}
      >
        <Video
          ref={mediaRef}
          src={media.audioUrl}
          preload="auto"
          playsInline
        ></Video>

        <div className="workspace">
          <LessonStage
            key={media.attempt}
            lesson={lesson}
            imageUrl={media.imageUrl}
            scene={scene}
            timeMs={clock}
            onImageError={() => media.setProblem("image")}
          />
          <LessonBoard
            lesson={lesson}
            scene={scene}
            timeMs={clock}
            reduceMotion={reduced}
          />
        </div>

        {caption && <CaptionLine text={caption.text} />}

        {/* The skin's touch tap only toggles the controls; in a lesson a tap
            should also pause and resume, like tapping a teacher's video. */}
        <Gesture type="tap" action="togglePaused" pointer="touch" />

        <LessonTopBar
          onExit={exit}
          captionsOn={captionsOn}
          onToggleCaptions={toggleCaptions}
          onOpenChapters={() => setChaptersOpen(true)}
        />

        {chaptersOpen && (
          <ChaptersPanel
            chapters={chapters}
            current={stepIndexAt(lesson.steps, clock)}
            onSelect={(chapter: Chapter) => {
              setChaptersOpen(false);
              seekTo(chapter.startMs);
            }}
            onClose={() => setChaptersOpen(false)}
          />
        )}

        {ended && lesson.trap && !media.problem && (
          <EndCard
            trap={lesson.trap}
            onReplay={() => seekTo(0)}
            onExit={exit}
          />
        )}

        {media.problem && (
          <MediaProblem
            what={media.problem}
            busy={media.reloading}
            onRetry={() => void media.reload()}
            onExit={exit}
          />
        )}

        {autoplay.blocked && !media.problem && (
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

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * The narration and photo URLs, and recovery when either fails to load.
 * Media URLs may be short-lived signed links, so "Tekrar dene" asks native
 * to refetch the lesson for fresh ones, reloads the narration and picks up
 * where the student was.
 */
function useFreshMedia(
  lesson: Lesson,
  origin: string,
  mediaRef: RefObject<HTMLVideoElement | null>,
  onReloadMedia: LessonPlayerDomProps["onReloadMedia"],
) {
  const [fresh, setFresh] = useState<{ audio: string; image: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const resumeAt = useRef(0);

  // A new lesson from native (already fresh) replaces any earlier override.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on new URLs only
  useEffect(() => setFresh(null), [lesson.audio.url, lesson.image.url]);

  const audioUrl = mediaSrc(origin, fresh?.audio ?? lesson.audio.url);
  const imageUrl = mediaSrc(origin, fresh?.image ?? lesson.image.url);
  const [audioFailed, setAudioFailed] = useMediaFailure(mediaRef, audioUrl);

  // After a retry (fresh links are set in the same render): reload the
  // narration and continue where it stopped.
  useEffect(() => {
    const element = mediaRef.current;
    if (attempt === 0 || !element) return;
    const resume = () => {
      element.currentTime = resumeAt.current;
      void element.play().catch(() => undefined);
    };
    element.addEventListener("loadedmetadata", resume, { once: true });
    element.load();
    return () => element.removeEventListener("loadedmetadata", resume);
  }, [attempt, mediaRef]);

  const reload = async () => {
    setReloading(true);
    resumeAt.current = mediaRef.current?.currentTime ?? 0;
    try {
      const next = await onReloadMedia();
      if (next) setFresh({ audio: next.audioUrl, image: next.imageUrl });
    } catch {
      // Offline still: retry with the links we have; the card comes back if it fails.
    }
    setAudioFailed(false);
    setImageFailed(false);
    setAttempt((n) => n + 1);
    setReloading(false);
  };

  return {
    audioUrl,
    imageUrl,
    attempt,
    reloading,
    problem: audioFailed
      ? ("audio" as const)
      : imageFailed
        ? ("image" as const)
        : null,
    setProblem: (what: "image") => {
      if (what === "image") setImageFailed(true);
    },
    reload,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cloud lessons carry absolute media URLs; local ones are relative to the API. */
function mediaSrc(origin: string, url: string): string {
  return /^https?:\/\//.test(url) ? url : origin + url;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LessonPlayerDomProps {
  lesson: Lesson;
  /** Origin of the API routes (empty on web, the dev server on native). */
  origin: string;
  /** False while the app is in the background: playback pauses. */
  active: boolean;
  /** The OS asks for less motion: no camera glide or pop animations. */
  reduceMotion: boolean;
  /** Subtitles on at start (the student's saved choice). */
  captionsOn: boolean;
  onCaptionsChange: (on: boolean) => Promise<void>;
  onExit: () => Promise<void>;
  /** Refetches the lesson for fresh media links (null when it can't). */
  onReloadMedia: () => Promise<{ audioUrl: string; imageUrl: string } | null>;
  /** A crash inside the player, for logging on the native side. */
  onError: (message: string) => Promise<void>;
  dom?: DOMProps;
}
