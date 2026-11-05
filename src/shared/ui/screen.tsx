import { View, type ViewProps } from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/shared/lib/cn";

/**
 * Full-screen container on the app background, inset from the notch and home
 * bar. Content padding sits on an inner view: SafeAreaView writes its insets
 * as inline padding, which would override padding classes on itself.
 */
export function Screen({
  edges = ["top", "bottom", "left", "right"],
  className,
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      <View className={cn("flex-1 px-5", className)} {...props} />
    </SafeAreaView>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ScreenProps extends ViewProps {
  edges?: Edge[];
  className?: string;
}
