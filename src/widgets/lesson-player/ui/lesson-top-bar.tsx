import { ClosedCaptionIcon, ListViewIcon } from "@hugeicons/core-free-icons";
import { createElement } from "react";

/**
 * Top overlay in the Video.js skin's button style: close on the left, the
 * step list ("Bölümler") and the subtitle toggle ("Altyazı") on the right.
 * It shows and hides together with the skin's controls.
 */
export function LessonTopBar({
  onExit,
  captionsOn,
  onToggleCaptions,
  onOpenChapters,
}: {
  onExit: () => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onOpenChapters: () => void;
}) {
  return (
    <div className="lesson-top">
      <button
        type="button"
        className="media-button lesson-top-button"
        aria-label="Kapat"
        onClick={onExit}
      >
        <svg viewBox="0 0 24 24" className="media-button-icon" aria-hidden>
          <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" />
        </svg>
      </button>
      <span className="lesson-top-spacer" />
      <button type="button" className="top-pill" onClick={onOpenChapters}>
        <HugeIcon icon={ListViewIcon} />
        Bölümler
      </button>
      <button
        type="button"
        className="top-pill"
        aria-pressed={captionsOn}
        onClick={onToggleCaptions}
      >
        <HugeIcon icon={ClosedCaptionIcon} />
        Altyazı
      </button>
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

/** A Hugeicons glyph as plain SVG (the DOM player has no React Native icons). */
function HugeIcon({ icon }: { icon: typeof ListViewIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
    >
      {icon.map(([tag, attrs], i) =>
        createElement(tag, { ...attrs, key: i, stroke: "currentColor" }),
      )}
    </svg>
  );
}
