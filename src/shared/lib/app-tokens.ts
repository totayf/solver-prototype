// ── Theme ────────────────────────────────────────────────────────────────────
// Light and monochrome: white canvas, black type and actions, a few grays for
// structure. Color is kept for meaning only (errors, and the teacher's ink).

export const APP = {
  background: "#FFFFFF",
  surface: "#F6F6F6",
  border: "#E6E6E6",
  foreground: "#0A0A0A",
  foregroundMuted: "#737373",
  primary: "#0A0A0A",
  primaryForeground: "#FFFFFF",
  destructive: "#DC2626",
} as const;

export const APP_RADIUS = {
  card: 16,
  pill: 999,
} as const;

export const APP_FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;
