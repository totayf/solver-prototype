import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLesson } from "@/entities/lesson";
import {
  canRetry,
  GeneratingView,
  useRetryLesson,
} from "@/features/create-lesson";
import { useDeleteLesson } from "@/features/delete-lesson";
import { friendlyError } from "@/shared/api/friendly-error";
import { APP } from "@/shared/lib/app-tokens";
import { useOrientationLock } from "@/shared/lib/use-orientation-lock";
import { type ProblemAction, ProblemView, Screen } from "@/shared/ui";
import { LessonPlayer } from "@/widgets/lesson-player";

/**
 * One lesson by id: the waiting screen while it is being made, the player
 * once it is ready, or what went wrong (with "Tekrar dene" / "Sil").
 */
export default function LessonPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, entry, error, refetch } = useLesson(id);
  const lesson = state?.status === "ready" ? state.lesson : null;
  useOrientationLock(lesson ? "landscape" : "portrait");
  const retry = useRetryLesson();
  const { deleteLesson } = useDeleteLesson();

  const leave = () =>
    router.canGoBack() ? router.back() : router.replace("/examples");

  if (lesson) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ animation: "fade" }} />
        <StatusBar hidden />
        <LessonPlayer lesson={lesson} onExit={leave} />
      </SafeAreaView>
    );
  }

  const stage =
    state?.status === "pending"
      ? state.stage
      : !state && entry?.status === "pending"
        ? entry.stage
        : null;
  if (stage) {
    return (
      <Screen>
        <GeneratingView
          stage={stage}
          waitingForNetwork={Boolean(error)}
          onBackground={leave}
        />
      </Screen>
    );
  }

  if (state?.status === "failed" || error) {
    const message =
      state?.status === "failed"
        ? state.error.message
        : friendlyError(error).message;
    const actions: ProblemAction[] = [];
    if (state?.status === "failed" && entry && canRetry(entry)) {
      actions.push({
        label: "Tekrar dene",
        loading: retry.isPending,
        onPress: () =>
          retry.mutate(entry, {
            onSuccess: (next) => {
              if (next !== id) {
                router.replace({
                  pathname: "/lesson/[id]",
                  params: { id: next },
                });
              }
            },
          }),
      });
    } else if (!state) {
      actions.push({ label: "Tekrar dene", onPress: () => void refetch() });
    }
    if (state?.status === "failed" && entry) {
      actions.push({
        label: state.error.kind === "gone" ? "Listeden kaldır" : "Sil",
        onPress: () =>
          void deleteLesson(entry).then(leave, (e: unknown) =>
            Alert.alert("Silinemedi", friendlyError(e).message),
          ),
      });
    }
    actions.push({ label: "Geri dön", onPress: leave });
    return (
      <Screen>
        <ProblemView
          message={retry.error ? friendlyError(retry.error).message : message}
          actions={actions}
        />
      </Screen>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={APP.primary} />
    </View>
  );
}
