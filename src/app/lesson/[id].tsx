import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLesson } from "@/entities/lesson";
import { APP } from "@/shared/lib/app-tokens";
import { useOrientationLock } from "@/shared/lib/use-orientation-lock";
import { Button, Text } from "@/shared/ui";
import { LessonPlayer } from "@/widgets/lesson-player";

export default function LessonPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lesson, error, refetch } = useLesson(id);
  useOrientationLock("landscape");

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ animation: "fade" }} />
      <StatusBar hidden />
      {lesson ? (
        <LessonPlayer lesson={lesson} onExit={() => router.back()} />
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text variant="body" className="text-center">
            {error.message}
          </Text>
          <Button
            label="Tekrar dene"
            variant="secondary"
            onPress={() => void refetch()}
          />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={APP.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}
