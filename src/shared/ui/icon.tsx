import { HugeiconsIcon } from "@hugeicons/react-native";
import type { ComponentProps } from "react";

import { APP } from "@/shared/lib/app-tokens";

// ── Component ────────────────────────────────────────────────────────────────

/** Hugeicons wrapper with the app's default size, stroke and color. */
export function Icon({
  size = 24,
  strokeWidth = 1.5,
  color = APP.foreground,
  ...props
}: IconProps) {
  return (
    <HugeiconsIcon
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      {...props}
    />
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type HugeiconsProps = ComponentProps<typeof HugeiconsIcon>;

export interface IconProps extends Omit<HugeiconsProps, "color"> {
  /** Defaults to the theme foreground color. */
  color?: string;
}
