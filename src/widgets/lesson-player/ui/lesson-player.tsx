import { useRef } from "react";

import type { Lesson } from "@/entities/lesson";
import { apiOrigin } from "@/shared/api/api-origin";
import { useAppActive } from "@/shared/lib/use-app-active";
import { useReduceMotion } from "@/shared/lib/use-reduce-motion";

import { usePlayerSettings } from "../model/player-settings";
import LessonPlayerDom from "./lesson-player.dom";

/**
 * Native host for the web-rendered lesson player: passes the app state
 * (background → pause), the reduce-motion setting and the saved subtitle
 * choice in; exit (once, however often it's tapped), media refresh and
 * crash reports come back out.
 */
export function LessonPlayer({
  lesson,
  onExit,
  onReloadMedia,
}: {
  lesson: Lesson;
  onExit: () => void;
  /** Refetches the lesson (fresh, possibly signed media links). */
  onReloadMedia?: () => Promise<Lesson | null>;
}) {
  const active = useAppActive();
  const reduceMotion = useReduceMotion();
  const [settings, updateSettings] = usePlayerSettings();
  const exited = useRef(false);

  return (
    <LessonPlayerDom
      lesson={lesson}
      origin={apiOrigin()}
      active={active}
      reduceMotion={reduceMotion}
      captionsOn={settings.captions}
      onCaptionsChange={async (captions) => updateSettings({ captions })}
      onExit={async () => {
        if (exited.current) return;
        exited.current = true;
        onExit();
      }}
      onReloadMedia={async () => {
        const fresh = await onReloadMedia?.().catch(() => null);
        return fresh
          ? { audioUrl: fresh.audio.url, imageUrl: fresh.image.url }
          : null;
      }}
      onError={async (message) => {
        console.warn("[lesson-player] crashed:", message);
      }}
      dom={{
        style: { flex: 1 },
        scrollEnabled: false,
        bounces: false,
        allowsInlineMediaPlayback: true,
        // The lesson starts talking on its own, and Video.js starts playback
        // asynchronously — iOS would block both as "not user-initiated".
        mediaPlaybackRequiresUserAction: false,
        contentInsetAdjustmentBehavior: "never",
      }}
    />
  );
}
