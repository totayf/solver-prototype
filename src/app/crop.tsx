import {
  Alert02Icon,
  RotateClockwiseIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { GenerationStage } from "@/entities/lesson";
import {
  CropFrame,
  type CropFrameHandle,
  GeneratingView,
  imageSize,
  rotateImage,
  useCreateLesson,
} from "@/features/create-lesson";
import { APP } from "@/shared/lib/app-tokens";
import { Button, Icon, PressableScale, Screen, Text } from "@/shared/ui";

export default function CropPage() {
  const params = useLocalSearchParams<{ uri: string }>();
  const [uri, setUri] = useState(params.uri);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const frame = useRef<CropFrameHandle>(null);
  const [stage, setStage] = useState<GenerationStage | null>(null);
  const createLesson = useCreateLesson({ onStage: setStage });
  // Set synchronously on the first tap, so a double tap can't pay for two lessons.
  const started = useRef(false);

  useEffect(() => {
    setSize(null);
    void imageSize(uri).then(setSize);
  }, [uri]);

  const solve = async () => {
    if (!frame.current || started.current) return;
    started.current = true;
    setStage(null);
    try {
      const lesson = await createLesson.mutateAsync({
        uri,
        crop: frame.current.crop(),
      });
      router.replace({ pathname: "/lesson/[id]", params: { id: lesson.id } });
    } catch {
      // The mutation keeps the error; it's shown below.
      started.current = false;
    }
  };

  if (createLesson.isPending || createLesson.error) {
    return (
      <Screen>
        {createLesson.error ? (
          <View className="flex-1 items-center justify-center gap-4">
            <Icon icon={Alert02Icon} size={28} color={APP.destructive} />
            <Text variant="body" className="text-center">
              {createLesson.error.message}
            </Text>
            <Button label="Tekrar dene" onPress={() => createLesson.reset()} />
          </View>
        ) : (
          <GeneratingView stage={stage ?? undefined} />
        )}
      </Screen>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Text variant="label" className="mt-2 text-center text-white">
        Sadece tek soruyu çerçevele
      </Text>
      {size ? (
        <CropFrame ref={frame} uri={uri} imageSize={size} />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      <View className="flex-row items-center justify-between px-6 pb-2 pt-3">
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Text variant="label" className="text-white">
            Vazgeç
          </Text>
        </Pressable>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Çöz"
          onPress={() => void solve()}
          className="h-16 w-16 items-center justify-center rounded-pill bg-white"
        >
          <Icon icon={Tick02Icon} size={28} color={APP.foreground} />
        </PressableScale>
        <Pressable
          hitSlop={12}
          accessibilityLabel="Döndür"
          onPress={() => void rotateImage(uri).then(setUri)}
        >
          <Icon icon={RotateClockwiseIcon} size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
