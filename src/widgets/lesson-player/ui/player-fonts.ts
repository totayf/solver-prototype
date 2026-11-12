/**
 * Fonts the player needs, bundled with the app (no Google Fonts or CDN at
 * runtime, so lessons draw offline and nothing leaks to third parties):
 * Shantell Sans for everything the pen writes, and the KaTeX faces that
 * fractions, roots and brackets use (the layout CSS comes from the katex
 * package via `katex-css.generated.ts`, without its relative font URLs).
 *
 * Runs in the player's WebView only.
 */
export function loadPlayerFonts(timeoutMs = FONT_TIMEOUT_MS): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !("fonts" in document)) {
    loading = Promise.resolve();
    return loading;
  }

  let pen: FontFace | null = null;
  for (const font of FONTS) {
    try {
      const face = new FontFace(font.family, `url("${assetUrl(font.src)}")`, {
        weight: font.weight ?? "400",
        style: font.style ?? "normal",
      });
      document.fonts.add(face);
      if (font.family === PEN_FAMILY) pen = face;
    } catch {
      // A missing face falls back to the next font in the stack.
    }
  }
  // KaTeX faces load on first use; only the pen font is awaited.
  const penReady = pen
    ? pen.load().then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();
  loading = Promise.race([
    penReady,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  return loading;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Past this the lesson starts anyway, in the fallback font. */
const FONT_TIMEOUT_MS = 2_500;
const PEN_FAMILY = "Shantell Sans";

// Static requires so Metro bundles each file as an asset of the player.
const FONTS: FontSource[] = [
  {
    family: PEN_FAMILY,
    weight: "600",
    src: require("@expo-google-fonts/shantell-sans/600SemiBold/ShantellSans_600SemiBold.ttf"),
  },
  {
    family: "KaTeX_Main",
    src: require("katex/dist/fonts/KaTeX_Main-Regular.ttf"),
  },
  {
    family: "KaTeX_Main",
    weight: "700",
    src: require("katex/dist/fonts/KaTeX_Main-Bold.ttf"),
  },
  {
    family: "KaTeX_Main",
    style: "italic",
    src: require("katex/dist/fonts/KaTeX_Main-Italic.ttf"),
  },
  {
    family: "KaTeX_Math",
    style: "italic",
    src: require("katex/dist/fonts/KaTeX_Math-Italic.ttf"),
  },
  {
    family: "KaTeX_AMS",
    src: require("katex/dist/fonts/KaTeX_AMS-Regular.ttf"),
  },
  {
    family: "KaTeX_Size1",
    src: require("katex/dist/fonts/KaTeX_Size1-Regular.ttf"),
  },
  {
    family: "KaTeX_Size2",
    src: require("katex/dist/fonts/KaTeX_Size2-Regular.ttf"),
  },
  {
    family: "KaTeX_Size3",
    src: require("katex/dist/fonts/KaTeX_Size3-Regular.ttf"),
  },
  {
    family: "KaTeX_Size4",
    src: require("katex/dist/fonts/KaTeX_Size4-Regular.ttf"),
  },
];

let loading: Promise<void> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A bundled asset is a URL string on web/DOM builds, or an object with one. */
function assetUrl(asset: unknown): string {
  if (typeof asset === "string") return asset;
  if (asset && typeof asset === "object") {
    const { uri, default: fallback } = asset as {
      uri?: unknown;
      default?: unknown;
    };
    if (typeof uri === "string") return uri;
    if (typeof fallback === "string") return fallback;
  }
  return "";
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FontSource {
  family: string;
  weight?: string;
  style?: string;
  src: unknown;
}
