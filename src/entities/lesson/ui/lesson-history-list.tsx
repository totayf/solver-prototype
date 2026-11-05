import { Alert, Pressable, View } from "react-native";

import { Text } from "@/shared/ui";

import {
  useClearLessonHistory,
  useLessonHistory,
} from "../model/lesson-history";
import { LessonRow } from "./lesson-row";

/** Recent lessons on this device; renders nothing until there is one. */
export function LessonHistoryList({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const { data: lessons = [] } = useLessonHistory();
  const clearHistory = useClearLessonHistory();
  if (lessons.length === 0) return null;

  const confirmClear = () =>
    Alert.alert(
      "Emin misin?",
      "Son sorular ve tüm dersleri kalıcı olarak silinecek.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => void clearHistory(),
        },
      ],
    );

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label" className="text-foreground-muted">
          Son sorular
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={confirmClear}
          hitSlop={8}
        >
          <Text variant="label" className="text-foreground-muted">
            Temizle
          </Text>
        </Pressable>
      </View>
      {lessons.map((lesson) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          onPress={() => onOpen(lesson.id)}
        />
      ))}
    </View>
  );
}
