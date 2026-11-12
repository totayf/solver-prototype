import { RotateClockwiseIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CropFrame,
  type CropFrameHandle,
  GeneratingView,
  type QuestionImage,
  rotateImage,
  useSolveQuestion,
} from "@/features/create-lesson";
import { friendlyError } from "@/shared/api/friendly-error";
import { APP } from "@/shared/lib/app-tokens";
import { Icon, PressableScale, ProblemView, Screen, Text } from "@/shared/ui";

export default function CropPage() {
  const params = useLocalSearchParams<{
    uri: string;
    width: string;
    height: string;
  }>();
  const [image, setImage] = useState<QuestionImage>(() => ({
    uri: params.uri,
    width: Number(params.width) || 0,
    height: Number(params.height) || 0,
  }));
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const frame = useRef<CropFrameHandle>(null);
  const solve = useSolveQuestion({
    onStarted: (id) =>
      router.replace({ pathname: "/lesson/[id]", params: { id } }),
  });

  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    setRotateError(null);
    try {
      setImage(await rotateImage(image));
      solve.resetCrop();
    } catch (e) {
      setRotateError(friendlyError(e).message);
    } finally {
      setRotating(false);
    }
  };

  if (solve.phase === "sending") {
    return (
      <Screen>
        <GeneratingView stage="uploading" />
      </Screen>
    );
  }
  if (solve.phase === "failed" && solve.error) {
    return (
      <Screen>
        <ProblemView
          message={solve.error.message}
          actions={[
            { label: "Tekrar dene", onPress: () => solve.retry(image) },
            { label: "Kırpmayı düzenle", onPress: solve.editCrop },
          ]}
        />
      </Screen>
    );
  }

  const ready = image.width > 0 && image.height > 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Text variant="label" className="mt-2 text-center text-white">
        {rotateError ?? "Sadece tek soruyu çerçevele"}
      </Text>
      {ready ? (
        <CropFrame
          ref={frame}
          uri={image.uri}
          imageSize={image}
          initialCrop={solve.crop}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="body" className="text-center text-white">
            Fotoğraf hazırlanamadı, geri dönüp tekrar dene.
          </Text>
        </View>
      )}
      <View className="flex-row items-center justify-between px-6 pb-2 pt-3">
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text variant="label" className="text-white">
            Vazgeç
          </Text>
        </Pressable>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Çöz"
          disabled={!ready || rotating}
          onPress={() =>
            frame.current && solve.solve(image, frame.current.crop())
          }
          className="h-16 w-16 items-center justify-center rounded-pill bg-white"
        >
          <Icon icon={Tick02Icon} size={28} color={APP.foreground} />
        </PressableScale>
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Döndür"
          disabled={!ready || rotating}
          onPress={() => void rotate()}
        >
          <Icon icon={RotateClockwiseIcon} size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
