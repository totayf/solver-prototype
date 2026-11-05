import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";

/**
 * Locks the screen orientation while the calling screen is mounted, and goes
 * back to the app default (portrait) when it unmounts — so leaving a
 * landscape screen always returns to an upright app.
 */
export function useOrientationLock(orientation: "landscape" | "portrait") {
  useEffect(() => {
    lock(LOCKS[orientation]);
    return () => lock(LOCKS.portrait);
  }, [orientation]);
}

/** The app is portrait everywhere except screens that opt in. */
export function lockAppToPortrait() {
  lock(LOCKS.portrait);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Browsers (the web preview) may refuse orientation locks; that's fine. */
function lock(orientation: ScreenOrientation.OrientationLock) {
  ScreenOrientation.lockAsync(orientation).catch(() => undefined);
}

// ── Constants ────────────────────────────────────────────────────────────────

const LOCKS = {
  landscape: ScreenOrientation.OrientationLock.LANDSCAPE,
  portrait: ScreenOrientation.OrientationLock.PORTRAIT_UP,
} as const;
