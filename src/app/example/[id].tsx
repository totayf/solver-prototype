import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { EXAMPLE_MODELS, TOOL_LABELS, useExamples } from "@/entities/example";
import { useGenerateExample } from "@/features/generate-example";
import { apiOrigin } from "@/shared/api/api-origin";
import { friendlyError } from "@/shared/api/friendly-error";
import { APP } from "@/shared/lib/app-tokens";
import { cn } from "@/shared/lib/cn";
import { useNavigationLock } from "@/shared/lib/use-navigation-lock";
import { Icon, PressableScale, Screen, Text } from "@/shared/ui";

export default function ExamplePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useExamples();
  const question = data?.questions.find((q) => q.id === id);
  const { generate, pending, error } = useGenerateExample(id);
  const [aspect, setAspect] = useState(1);
  const navigate = useNavigationLock();

  return (
    <Screen edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-2 py-2">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Geri"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-pill"
        >
          <Icon icon={ArrowLeft01Icon} size={24} />
        </PressableScale>
        <Text variant="heading" numberOfLines={1} className="flex-1">
          {question ? `${question.subject} / ${question.topic}` : ""}
        </Text>
      </View>

      {!question ? (
        <ActivityIndicator color={APP.primary} />
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 pb-10"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: apiOrigin() + question.imageUrl }}
            contentFit="contain"
            onLoad={(e) => setAspect(e.source.width / e.source.height)}
            style={{
              width: "100%",
              aspectRatio: aspect,
              borderRadius: 12,
              backgroundColor: APP.surface,
            }}
          />
          {question.tools.some((tool) => TOOL_LABELS[tool]) && (
            <Text variant="caption">
              Kullanılan araçlar:{" "}
              {question.tools
                .flatMap((tool) => TOOL_LABELS[tool] ?? [])
                .join(", ")}
            </Text>
          )}
          <View className="gap-3">
            {EXAMPLE_MODELS.map((model) => {
              const lessonId = question.lessons[model.id];
              if (!lessonId) return null;
              const working = pending.includes(model.id);
              return (
                <PressableScale
                  key={model.id}
                  accessibilityRole="button"
                  disabled={working}
                  onPress={() =>
                    lessonId
                      ? navigate(() =>
                          router.push({
                            pathname: "/lesson/[id]",
                            params: { id: lessonId },
                          }),
                        )
                      : generate(model.id)
                  }
                  className={cn(
                    "h-14 flex-row items-center justify-center gap-2.5 rounded-pill px-6",
                    lessonId
                      ? "bg-primary"
                      : "border-2 border-dashed border-foreground-muted",
                  )}
                >
                  {working && <ActivityIndicator color={APP.foreground} />}
                  <Text
                    variant="label"
                    className={cn(
                      "font-inter-semibold",
                      lessonId && "text-primary-foreground",
                    )}
                  >
                    {lessonId
                      ? `${model.label} ile izle`
                      : working
                        ? `${model.label} hazırlıyor… (yaklaşık iki dakika)`
                        : `${model.label} ile üret`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {error && (
            <Text variant="caption" className="text-center text-foreground">
              {friendlyError(error).message}
            </Text>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
