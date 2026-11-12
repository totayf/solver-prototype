import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Guards navigation against double taps: the first call runs, later ones
 * are ignored until this screen is focused again (or a short fallback has
 * passed, in case the navigation never happened).
 */
export function useNavigationLock() {
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      locked.current = false;
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }, []),
  );

  return useCallback((navigate: () => void) => {
    if (locked.current) return;
    locked.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      locked.current = false;
    }, UNLOCK_AFTER_MS);
    navigate();
  }, []);
}

// ── Constants ────────────────────────────────────────────────────────────────

const UNLOCK_AFTER_MS = 1_000;
