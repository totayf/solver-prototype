import type { PointerEvent } from "react";

import type { Chapter } from "../lib/timeline";

/**
 * Panels and cards drawn over the lesson. Their pointer events stop here,
 * so a tap on them never reaches the skin's tap-to-pause gesture.
 */

/** The step being spoken, as a subtitle line. */
export function CaptionLine({ text }: { text: string }) {
  return (
    <div className="caption" aria-hidden>
      {text}
    </div>
  );
}

/** "Bölümler": every step with its start; tapping one plays it from the start. */
export function ChaptersPanel({
  chapters,
  current,
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  current: number;
  onSelect: (chapter: Chapter) => void;
  onClose: () => void;
}) {
  return (
    <section
      className="chapters"
      aria-label="Bölümler"
      onPointerUp={stop}
      onPointerDown={stop}
    >
      <div className="chapters-head">
        <h2>Bölümler</h2>
        <button type="button" className="chapters-close" onClick={onClose}>
          Kapat
        </button>
      </div>
      <ol>
        {chapters.map((chapter) => (
          <li key={chapter.index}>
            <button
              type="button"
              className="chapter"
              aria-current={chapter.index === current ? "step" : undefined}
              aria-label={`${chapter.index + 1}. bölüm, ${formatTime(chapter.startMs)}: ${chapter.label}`}
              onClick={() => onSelect(chapter)}
            >
              <span className="chapter-number">{chapter.index + 1}</span>
              <span className="chapter-text">{chapter.label}</span>
              <span className="chapter-time">
                {formatTime(chapter.startMs)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** End of the lesson: the trap to avoid, then the nudge to solve it on paper. */
export function EndCard({
  trap,
  onReplay,
  onExit,
}: {
  trap: string;
  onReplay: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-label="Ders bitti"
      onPointerUp={stop}
      onPointerDown={stop}
    >
      <div className="card">
        <p className="end-trap">
          <strong>Tuzak:</strong> {trap}
        </p>
        <p className="end-next">Şimdi kağıtta tekrar çöz.</p>
        <div className="card-actions">
          <button
            type="button"
            className="card-button primary"
            onClick={onReplay}
          >
            Tekrar izle
          </button>
          <button type="button" className="card-button" onClick={onExit}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

/** The narration or the photo didn't load; "Tekrar dene" fetches fresh links. */
export function MediaProblem({
  what,
  busy,
  onRetry,
  onExit,
}: {
  what: "audio" | "image";
  busy: boolean;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="overlay"
      role="alert"
      onPointerUp={stop}
      onPointerDown={stop}
    >
      <div className="card">
        <p className="card-title">
          {what === "audio"
            ? "Anlatımın sesi yüklenemedi."
            : "Sorunun fotoğrafı yüklenemedi."}
        </p>
        <p className="card-muted">
          İnternet bağlantını kontrol edip tekrar dene.
        </p>
        <div className="card-actions">
          <button
            type="button"
            className="card-button primary"
            disabled={busy}
            onClick={onRetry}
          >
            {busy ? "Yükleniyor…" : "Tekrar dene"}
          </button>
          <button type="button" className="card-button" onClick={onExit}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stop(event: PointerEvent) {
  event.stopPropagation();
}

export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
