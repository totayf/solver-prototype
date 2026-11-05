import type { IconSvgElement } from "@hugeicons/react-native";
import { ActivityIndicator } from "react-native";

import { APP } from "@/shared/lib/app-tokens";
import { cn } from "@/shared/lib/cn";

import { Icon } from "./icon";
import { PressableScale, type PressableScaleProps } from "./pressable-scale";
import { Text } from "./text";

// ── Component ────────────────────────────────────────────────────────────────

/** Pill button: solid white (primary) or outlined (secondary). */
export function Button({
  label,
  icon,
  variant = "primary",
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const contentColor =
    variant === "primary" ? APP.primaryForeground : APP.foreground;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      className={cn(
        "h-14 flex-row items-center justify-center gap-2.5 rounded-pill px-6",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <>
          {icon && (
            <Icon
              icon={icon}
              size={20}
              strokeWidth={1.8}
              color={contentColor}
            />
          )}
          <Text
            variant="label"
            className={cn(
              "font-inter-semibold",
              variant === "primary" && "text-primary-foreground",
            )}
          >
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const VARIANTS = {
  primary: "bg-primary",
  secondary: "border border-border bg-background",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends Omit<PressableScaleProps, "children" | "className"> {
  label: string;
  icon?: IconSvgElement;
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  className?: string;
}
