/**
 * Top overlay with the close button, in the Video.js skin's button style.
 * It shows and hides together with the skin's controls.
 */
export function LessonTopBar({ onExit }: { onExit: () => Promise<void> }) {
  return (
    <div className="lesson-top">
      <button
        type="button"
        className="media-button lesson-top-button"
        aria-label="Kapat"
        onClick={() => void onExit()}
      >
        <svg viewBox="0 0 24 24" className="media-button-icon" aria-hidden>
          <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" />
        </svg>
      </button>
    </div>
  );
}
