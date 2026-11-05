import type { Lesson } from "@/entities/lesson";
import { apiOrigin } from "@/shared/api/api-origin";

import LessonPlayerDom from "./lesson-player.dom";

/** Native host for the web-rendered lesson player. */
export function LessonPlayer({
  lesson,
  onExit,
}: {
  lesson: Lesson;
  onExit: () => void;
}) {
  return (
    <LessonPlayerDom
      lesson={lesson}
      origin={apiOrigin()}
      onExit={async () => onExit()}
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
