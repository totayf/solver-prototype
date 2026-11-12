import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

import {
  EXAMPLE_EXAMS,
  type ExampleExam,
  ExampleRow,
  useExamples,
} from "@/entities/example";
import { friendlyError } from "@/shared/api/friendly-error";
import { APP } from "@/shared/lib/app-tokens";
import { useNavigationLock } from "@/shared/lib/use-navigation-lock";
import { Button, Screen, SegmentedControl, Text } from "@/shared/ui";

export default function ExamplesPage() {
  const { data, error, refetch } = useExamples();
  const navigate = useNavigationLock();
  const [exam, setExam] = useState<ExampleExam>("TYT");
  const questions = data?.questions.filter((q) => q.exam === exam) ?? [];

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerClassName="gap-6 pb-10 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <Text variant="title">Örnekler</Text>
          <Text variant="body" className="text-foreground-muted">
            Bir soru seç, hocayı istediğin modelle izle.
          </Text>
        </View>

        <SegmentedControl
          options={EXAMPLE_EXAMS.map((e) => ({ value: e, label: e }))}
          value={exam}
          onChange={setExam}
        />

        {error ? (
          <View className="items-center gap-4">
            <Text variant="body" className="text-center">
              {friendlyError(error).message}
            </Text>
            <Button
              label="Tekrar dene"
              variant="secondary"
              onPress={() => void refetch()}
            />
          </View>
        ) : !data ? (
          <ActivityIndicator color={APP.primary} />
        ) : questions.length === 0 ? (
          <Text variant="caption" className="text-center">
            Bu sınavdan henüz soru yok.
          </Text>
        ) : (
          <View className="gap-3">
            {questions.map((question) => (
              <ExampleRow
                key={question.id}
                question={question}
                onPress={() =>
                  navigate(() =>
                    router.push({
                      pathname: "/example/[id]",
                      params: { id: question.id },
                    }),
                  )
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
