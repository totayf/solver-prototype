import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { View } from "react-native";

import { APP } from "@/shared/lib/app-tokens";
import { Icon, PressableScale, Text } from "@/shared/ui";

import type { LessonSummary } from "../model/types";

/** One lesson in a list: answer badge, title, narration length. */
export function LessonRow({
  lesson,
  onPress,
}: {
  lesson: LessonSummary;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card border border-border bg-surface p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-primary">
        <Text
          variant="label"
          className="font-inter-bold text-primary-foreground"
        >
          {lesson.answer}
        </Text>
      </View>
      <View className="flex-1">
        <Text variant="label" numberOfLines={1}>
          {lesson.title}
        </Text>
        <Text variant="caption">
          {formatDuration(lesson.durationMs)} anlatım
        </Text>
      </View>
      <Icon icon={ArrowRight01Icon} size={20} color={APP.foregroundMuted} />
    </PressableScale>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
