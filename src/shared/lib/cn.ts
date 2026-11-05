import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { APP, APP_RADIUS } from "./app-tokens";

/** Merge class names; later classes win when they target the same property. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const toKebab = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

// tailwind-merge only dedupes classes it recognizes, so register our token names
// (`bg-surface` vs `bg-primary`, `rounded-card` vs `rounded-pill`).
const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: Object.keys(APP).map(toKebab),
      radius: Object.keys(APP_RADIUS).map(toKebab),
      font: ["inter", "inter-medium", "inter-semibold", "inter-bold"],
    },
  },
});
