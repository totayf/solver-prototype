import {
  Alert02Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { APP } from "@/shared/lib/app-tokens";
import { Icon, PressableScale, Text } from "@/shared/ui";

import type { LessonHistoryEntry } from "../model/history-model";
import { stageLabel } from "../model/stages";

/**
 * One lesson in the history: ready (answer badge, title, length), still
 * being made ("Hazırlanıyor…" with the photo and the server's stage) or
 * failed (the reason; `actions` holds what the student can do about it).
 */
export function LessonRow({
  entry,
  onPress,
  onDelete,
  actions,
}: {
  entry: LessonHistoryEntry;
  onPress: () => void;
  onDelete?: () => void;
  /** Buttons under a failed row (Tekrar dene / Sil). */
  actions?: ReactNode;
}) {
  return (
    <View className="gap-3 rounded-card border border-border bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel(entry)}
            onPress={onPress}
            className="flex-row items-center gap-3"
          >
            <Leading entry={entry} />
            <View className="flex-1">
              <Body entry={entry} />
            </View>
            {entry.status === "ready" && (
              <Icon
                icon={ArrowRight01Icon}
                size={20}
                color={APP.foregroundMuted}
              />
            )}
          </PressableScale>
        </View>
        {onDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sil"
            hitSlop={10}
            onPress={onDelete}
          >
            <Icon icon={Delete02Icon} size={20} color={APP.foregroundMuted} />
          </Pressable>
        )}
      </View>
      {entry.status === "failed" && actions && (
        <View className="flex-row gap-2">{actions}</View>
      )}
    </View>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function Leading({ entry }: { entry: LessonHistoryEntry }) {
  if (entry.status === "ready") {
    const short = isShortAnswer(entry.answer);
    return (
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-primary">
        {short ? (
          <Text
            variant="label"
            numberOfLines={1}
            className="font-inter-bold text-primary-foreground"
          >
            {entry.answer}
          </Text>
        ) : (
          <Icon icon={Tick02Icon} size={20} color={APP.primaryForeground} />
        )}
      </View>
    );
  }
  return (
    <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-pill bg-border">
      {entry.uploadUri && (
        <Image
          source={{ uri: entry.uploadUri }}
          contentFit="cover"
          style={THUMBNAIL}
          accessibilityIgnoresInvertColors
        />
      )}
      {entry.status === "pending" ? (
        <ActivityIndicator color={APP.foreground} />
      ) : (
        <Icon icon={Alert02Icon} size={20} color={APP.destructive} />
      )}
    </View>
  );
}

function Body({ entry }: { entry: LessonHistoryEntry }) {
  switch (entry.status) {
    case "ready":
      return (
        <>
          <Text variant="label" numberOfLines={1}>
            {entry.title}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {isShortAnswer(entry.answer) ? "" : `Cevap: ${entry.answer} · `}
            {formatDuration(entry.durationMs)} anlatım
          </Text>
        </>
      );
    case "pending":
      return (
        <>
          <Text variant="label" numberOfLines={1}>
            Hazırlanıyor…
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {stageLabel(entry.stage)} · yaklaşık iki dakika
          </Text>
        </>
      );
    case "failed":
      return (
        <>
          <Text variant="label" numberOfLines={1}>
            {entry.error.kind === "gone" ? "Ders bulunamadı" : "Hazırlanamadı"}
          </Text>
          <Text variant="caption" numberOfLines={2}>
            {entry.error.message}
          </Text>
        </>
      );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const THUMBNAIL = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: 0.6,
} as const;

/** Option letters and short results fit the badge; sentences go under the title. */
function isShortAnswer(answer: string): boolean {
  return answer.length > 0 && answer.length <= 3;
}

function accessibilityLabel(entry: LessonHistoryEntry): string {
  switch (entry.status) {
    case "ready":
      return `${entry.title}. Cevap ${entry.answer}. Dersi aç.`;
    case "pending":
      return `Ders hazırlanıyor: ${stageLabel(entry.stage)}. Bekleme ekranını aç.`;
    case "failed":
      return `Ders hazırlanamadı. ${entry.error.message}`;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
