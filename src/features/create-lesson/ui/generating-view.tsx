import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import {
  GENERATION_STAGES,
  type GenerationStage,
  stageIndex,
  stageLabel,
} from "@/entities/lesson";
import { APP } from "@/shared/lib/app-tokens";
import { Button, Text } from "@/shared/ui";

/**
 * Waiting screen while a lesson is made. It shows only what is really
 * happening: the photo upload, then the stage the server reports — no
 * timer-driven guesses. Stage changes are announced to screen readers.
 * `onBackground` lets the student leave; the lesson keeps being made and
 * waits in the history.
 */
export function GeneratingView({
  stage,
  waitingForNetwork = false,
  onBackground,
}: {
  stage: GenerationStage | "uploading";
  /** The last poll got no answer; polling continues. */
  waitingForNetwork?: boolean;
  onBackground?: () => void;
}) {
  const title =
    stage === "uploading" ? "Fotoğraf gönderiliyor…" : `${stageLabel(stage)}…`;
  const reached = stage === "uploading" ? -1 : stageIndex(stage);

  useEffect(() => {
    // Android reads the live region below; iOS needs an explicit announcement.
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  return (
    <View className="flex-1 items-center justify-center gap-6 px-6">
      <ActivityIndicator size="large" color={APP.primary} />
      <View
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={title}
      >
        <Animated.View
          key={title}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
        >
          <Text variant="heading" className="text-center">
            {title}
          </Text>
        </Animated.View>
      </View>
      <View
        className="flex-row gap-2"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {GENERATION_STAGES.map((item, i) => (
          <View
            key={item.stage}
            className={
              i <= reached
                ? "h-1.5 w-8 rounded-pill bg-primary"
                : "h-1.5 w-8 rounded-pill bg-border"
            }
          />
        ))}
      </View>
      <Text variant="caption" className="text-center">
        {waitingForNetwork
          ? "Bağlantı bekleniyor… Dersin sunucuda hazırlanmaya devam ediyor."
          : "Dersin hazırlanıyor, bu yaklaşık iki dakika sürer."}
      </Text>
      {onBackground && (
        <View className="items-center gap-2 self-stretch">
          <Button
            label="Arkada hazırlansın"
            variant="secondary"
            onPress={onBackground}
            className="self-stretch"
          />
          <Text variant="caption" className="text-center">
            Hazır olunca Son sorular listesinde seni bekler.
          </Text>
        </View>
      )}
    </View>
  );
}
