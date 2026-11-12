/**
 * Styles for the DOM player, layered on Video.js's default video skin
 * (`@videojs/react/video/skin.css`). The skin's rules use `:where()`, so the
 * plain class selectors here win without `!important`.
 */
export const PLAYER_CSS = /* css */ `
:root {
  --stage: #F2F2F2;
  --border: #E6E6E6;
  /* The teacher's tools: a red pen for lines, circles and notes, a yellow highlighter. */
  --ink: #E5292F;
  --marker: #FFD43B;
  /* Everything the pen writes uses one hand; missing glyphs fall back to a plain sans, never a script font. */
  --hand: "Shantell Sans", system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--stage); }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* ── Skin frame ─────────────────────────────────────────────────────────── */
/* Pinned to the viewport: the WebView body can keep its pre-rotation width. */
.lesson-skin { position: fixed; inset: 0; width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; background: var(--stage); }
/* The narration plays through the <video>; the stage is the picture. */
.lesson-skin video { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
/* iPhone WebViews can't do these; volume is hardware-only on iOS. */
.lesson-skin .media-fullscreen-button,
.lesson-skin .media-pip-button,
.lesson-skin .media-cast-button,
.lesson-skin .media-airplay-button,
.lesson-skin .video-controls-captions-button,
.lesson-skin .video-controls-volume-button { display: none; }

.workspace { position: absolute; inset: 0; z-index: 1; display: flex; }

/* ── Stage ─────────────────────────────────────────────────────────────── */
.stage { position: relative; flex: 1; overflow: hidden; }
.stage-canvas {
  position: absolute; transform-origin: 0 0;
  transition: transform .75s cubic-bezier(.22,.7,.2,1), left .75s cubic-bezier(.22,.7,.2,1), top .75s cubic-bezier(.22,.7,.2,1);
  background: #fff; border-radius: 8px;
  box-shadow: 0 0 0 1px var(--border), 0 8px 24px rgba(0,0,0,.06);
}
.stage-canvas img { display: block; width: 100%; height: 100%; border-radius: 8px; }
.stage-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.marker-layer { mix-blend-mode: multiply; }
path.marker { stroke: var(--marker); opacity: .55; stroke-linecap: butt; }
path.ink { stroke: var(--ink); stroke-linecap: round; stroke-linejoin: round; }
.figure-text { font-family: var(--hand); font-weight: 600; }
/* The pen tip moves by transform only (its shadow is drawn in), so a frame never repaints a filter. */
.pen-tip { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none; will-change: transform; }
.pen-tip svg { display: block; }

.handwriting { font-family: var(--hand); font-weight: 600; color: var(--ink); }
/* KaTeX keeps its layout (fraction bars, roots) but writes letters and digits in the same hand. */
.handwriting .katex { font-family: inherit; font-size: 1em; }
.handwriting .katex :is(.mathnormal, .mathit, .mathrm, .textrm, .mord, .mbin, .mrel, .mpunct) { font-family: inherit; font-style: normal; }
.note {
  font-size: .82em;
  position: absolute; white-space: nowrap; line-height: 1.1;
  padding: .05em .35em; border-radius: .3em; background: rgba(255,255,255,.92);
}

.answer-stamp {
  position: absolute; top: 64px; right: 16px; padding: 8px 14px; border-radius: 12px;
  background: #0A0A0A; color: #fff; font-size: 15px; font-weight: 500;
  display: flex; align-items: baseline; gap: 6px;
  animation: pop .45s cubic-bezier(.2,1.5,.4,1) both;
}
.answer-stamp strong { font-size: 24px; font-weight: 700; }
@keyframes pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* ── Board ─────────────────────────────────────────────────────────────── */
.board { width: 0; overflow: hidden; transition: width .5s cubic-bezier(.22,.7,.2,1); background: #FAFAFA; border-left: 1px solid transparent; }
.board.open { width: 50%; border-left-color: var(--border); }
.board-inner { height: 100%; min-width: 260px; overflow-y: auto; padding: 56px 16px 24px; display: flex; flex-direction: column; gap: 10px; }
.board-block { flex-shrink: 0; scroll-margin: 56px 0 24px; }
.board-line { margin: 0; font-size: 21px; line-height: 1.3; }
.board-figure-box { position: relative; }
.board-figure { display: block; width: 100%; height: auto; overflow: visible; }

/* ── Top bar (shows and hides with the skin's controls) ─────────────────── */
.lesson-top {
  position: absolute; top: 0; left: 0; right: 0; z-index: 30;
  display: flex; align-items: center; gap: 4px;
  padding: 10px max(12px, env(safe-area-inset-right)) 24px max(12px, env(safe-area-inset-left));
  background: linear-gradient(rgba(0,0,0,.55), transparent);
  color: #fff;
  opacity: 0; pointer-events: none; transition: opacity .25s ease;
}
.lesson-skin[data-controls-visible] .lesson-top { opacity: 1; pointer-events: auto; }

/* ── Start overlay ─────────────────────────────────────────────────────── */
.start {
  position: absolute; inset: 0; z-index: 60; display: grid; place-items: center;
  background: rgba(255,255,255,.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.start-button {
  display: flex; align-items: center; gap: 10px; padding: 14px 24px; border: 0; border-radius: 999px;
  background: #0A0A0A; color: #fff; font: inherit; font-weight: 600; font-size: 16px; cursor: pointer;
  transition: transform .12s ease, opacity .15s ease;
}
.start-button:hover { opacity: .9; }
.start-button:active { transform: scale(.95); }
.start-button svg { width: 18px; height: 18px; fill: #fff; }
`;

/** Web fonts the player needs: Shantell Sans for the pen (Turkish and math symbols) and KaTeX. */
export const PLAYER_STYLESHEETS = [
  "https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@500;600&display=swap",
  "https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css",
];
