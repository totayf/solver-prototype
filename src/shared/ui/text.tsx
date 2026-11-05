import {
  Text as NativeText,
  type TextProps as NativeTextProps,
} from "react-native";

import { cn } from "@/shared/lib/cn";

// ── Component ────────────────────────────────────────────────────────────────

/** App text with a small type scale; `className` refines the variant. */
export function Text({ variant = "body", className, ...props }: TextProps) {
  return (
    <NativeText
      role={
        variant === "title" || variant === "heading" ? "heading" : undefined
      }
      className={cn(VARIANTS[variant], className)}
      {...props}
    />
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const VARIANTS = {
  title: "font-inter-bold text-[28px] leading-[34px] text-foreground",
  heading: "font-inter-semibold text-[20px] leading-[26px] text-foreground",
  body: "font-inter text-[16px] leading-[23px] text-foreground",
  label: "font-inter-medium text-[15px] leading-[20px] text-foreground",
  caption: "font-inter text-[13px] leading-[18px] text-foreground-muted",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TextProps extends NativeTextProps {
  variant?: keyof typeof VARIANTS;
  className?: string;
}
