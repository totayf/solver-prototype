import katex from "katex";

/**
 * HTML for a handwritten note: plain text escaped, `$…$` parts rendered with
 * KaTeX. Broken LaTeX shows as text instead of throwing. Memoized: the player
 * asks for the same notes on every frame of playback.
 */
export function mathTextToHtml(text: string): string {
  let html = rendered.get(text);
  if (html === undefined) {
    html = render(text);
    if (rendered.size >= MAX_CACHED) rendered.clear();
    rendered.set(text, html);
  }
  return html;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function render(text: string): string {
  return text
    .split(/(\$[^$]+\$)/g)
    .map((part) =>
      part.startsWith("$") && part.endsWith("$") && part.length > 2
        ? katex.renderToString(part.slice(1, -1), { throwOnError: false })
        : escapeHtml(part),
    )
    .join("");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Note text → HTML. A lesson has a few dozen notes; the cap only guards long sessions. */
const rendered = new Map<string, string>();
const MAX_CACHED = 500;

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
