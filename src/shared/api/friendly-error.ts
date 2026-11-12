import {
  isAbortError,
  NetworkError,
  RequestError,
  UserFacingError,
} from "./errors";

/**
 * Any error → what the student reads (Turkish, "sen" form). Raw messages
 * never reach the screen: the only server text shown is the `{ error }` of a
 * JSON 500 from our API that reads as a sentence for the student (a refusal
 * such as "Bu soruda emin olamadım…"). `copy` lets a screen word a kind for
 * its own context ("Bu ders artık yok.").
 */
export function friendlyError(
  error: unknown,
  copy: Partial<Record<FriendlyErrorKind, string>> = {},
): FriendlyError {
  const make = (kind: FriendlyErrorKind, message?: string): FriendlyError => ({
    kind,
    message: message ?? copy[kind] ?? FRIENDLY_COPY[kind],
  });

  if (error instanceof UserFacingError) {
    return make(error.kind === "image" ? "image" : "other", error.message);
  }
  if (error instanceof NetworkError) return make("offline");
  if (isAbortError(error)) return make("offline");
  if (!(error instanceof RequestError)) return make("unknown");

  const { status, serverMessage } = error;
  if (isTransientError(error)) return make("busy");
  if (status === 401 || status === 403) return make("outdated");
  if (status === 404 || status === 410) return make("gone");
  if (status === 413) return make("image", TOO_LARGE);
  if (status === 415) return make("image", UNSUPPORTED_IMAGE);
  if (status === 500) {
    return make(
      "failed",
      serverMessage && isStudentFacing(serverMessage)
        ? serverMessage
        : undefined,
    );
  }
  return make("unknown");
}

/**
 * Worth trying again by itself: no connection, a timeout, a gateway or
 * overload answer, or anything that isn't our API's JSON (an HTML error page,
 * a captive portal). Polling keeps going through these.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (!(error instanceof RequestError)) return false;
  const { status, isJson } = error;
  if (TRANSIENT_STATUSES.has(status)) return true;
  if (!isJson && (status >= 500 || status < 300)) return true;
  return false;
}

/**
 * A server sentence meant for the student: Turkish, short, no markup. Our
 * API's refusals always contain Turkish letters ("emin olamadım", "değil");
 * an English or technical text from a proxy or a crash never does.
 */
export function isStudentFacing(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length >= 4 &&
    trimmed.length <= 300 &&
    TURKISH_LETTER.test(trimmed) &&
    !/[<>{}]|\bError\b|\bat\s+\S+\s*\(/.test(trimmed)
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;

const TOO_LARGE = "Fotoğraf çok büyük. Soruya biraz daha yakından çek.";
const UNSUPPORTED_IMAGE = "Bu fotoğraf açılamadı. Başka bir fotoğraf dene.";

export const FRIENDLY_COPY = {
  offline: "İnternet bağlantını kontrol edip tekrar dene.",
  busy: "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.",
  outdated:
    "Uygulamayı güncellemen gerekiyor. Mağazadan son sürümü yükleyip tekrar dene.",
  gone: "Aradığın içerik artık yok.",
  failed: "Bir şeyler ters gitti. Tekrar dene.",
  image: "Fotoğraf hazırlanamadı, tekrar dene.",
  other: "Bir şeyler ters gitti. Tekrar dene.",
  unknown: "Bir şeyler ters gitti. Tekrar dene.",
} as const satisfies Record<FriendlyErrorKind, string>;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * offline: no connection or timeout · busy: temporary server trouble ·
 * outdated: this build is no longer accepted · gone: 404 · failed: the server
 * gave up (its own message when it wrote one) · image: the photo couldn't be
 * prepared or sent · other/unknown: anything else.
 */
export type FriendlyErrorKind =
  | "offline"
  | "busy"
  | "outdated"
  | "gone"
  | "failed"
  | "image"
  | "other"
  | "unknown";

export interface FriendlyError {
  kind: FriendlyErrorKind;
  message: string;
}
