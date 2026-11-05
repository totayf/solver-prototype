import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { APP } from "@/shared/lib/app-tokens";
import { Text } from "@/shared/ui";

/**
 * Waiting screen while the lesson is generated. The server doesn't stream
 * progress yet, so stages advance on typical timings.
 */
export function GeneratingView() {
  const stage = useStage();

  return (
    <View className="flex-1 items-center justify-center gap-6">
      <ActivityIndicator size="large" color={APP.primary} />
      <Animated.View
        key={stage}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
      >
        <Text variant="heading" className="text-center">
          {STAGES[stage].title}
        </Text>
        <Text variant="caption" className="mt-1 text-center">
          {STAGES[stage].detail}
        </Text>
      </Animated.View>
      <View className="flex-row gap-2">
        {STAGES.map((item, i) => (
          <View
            key={item.title}
            className={
              i <= stage
                ? "h-1.5 w-8 rounded-pill bg-primary"
                : "h-1.5 w-8 rounded-pill bg-border"
            }
          />
        ))}
      </View>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function useStage(): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = STAGES.slice(1).map((item, i) =>
      setTimeout(() => setStage(i + 1), item.startsAtMs),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);
  return stage;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  {
    title: "Soruyu okuyorum…",
    detail: "Metni ve şıkları tarıyorum",
    startsAtMs: 0,
  },
  {
    title: "Çözüyorum…",
    detail: "Her şıkkı tek tek kontrol ediyorum",
    startsAtMs: 4_000,
  },
  {
    title: "Anlatımı hazırlıyorum…",
    detail: "Neyin altını çizeceğime karar veriyorum",
    startsAtMs: 22_000,
  },
  {
    title: "Seslendiriyorum…",
    detail: "Hocan birazdan hazır",
    startsAtMs: 38_000,
  },
] as const;
