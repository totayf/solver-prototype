import { Alert, Pressable, View } from "react-native";

import {
  type LessonHistoryEntry,
  LessonRow,
  useLessonHistory,
} from "@/entities/lesson";
import { canRetry, useRetryLesson } from "@/features/create-lesson";
import { useDeleteLesson } from "@/features/delete-lesson";
import { FRIENDLY_COPY, friendlyError } from "@/shared/api/friendly-error";
import { Button, Text } from "@/shared/ui";

/**
 * "Son sorular": the student's lessons on this device — ready ones to
 * watch, ones still being made (tap to wait for them), failed ones with
 * "Tekrar dene" (same photo, no second charge) and "Sil". Renders nothing
 * until there is one.
 */
export function LessonHistory({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: entries = [] } = useLessonHistory();
  const { deleteLesson, clearAll } = useDeleteLesson();
  const retry = useRetryLesson();
  if (entries.length === 0) return null;

  const runDelete = (entry: LessonHistoryEntry) =>
    deleteLesson(entry).catch((error: unknown) =>
      Alert.alert("Silinemedi", deleteFailure(error), [
        { text: "Vazgeç", style: "cancel" },
        { text: "Tekrar dene", onPress: () => void runDelete(entry) },
      ]),
    );

  const confirmDelete = (entry: LessonHistoryEntry) => {
    // A lesson the server no longer has only leaves the list.
    if (entry.status === "failed" && entry.error.kind === "gone") {
      void runDelete(entry);
      return;
    }
    Alert.alert(
      "Bu ders silinsin mi?",
      entry.status === "pending"
        ? "Ders hazırlanıyor. Silersen bu soru listeden ve sunucudan kalkar."
        : "Ders bu cihazdan ve sunucudan kalıcı olarak silinecek.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => void runDelete(entry),
        },
      ],
    );
  };

  const runClear = async () => {
    const failed = await clearAll();
    if (failed > 0) {
      Alert.alert(
        "Bazı dersler silinemedi",
        `${failed} ders silinemedi. ${FRIENDLY_COPY.offline}`,
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Tekrar dene", onPress: () => void runClear() },
        ],
      );
    }
  };

  const confirmClear = () =>
    Alert.alert(
      "Emin misin?",
      "Son sorular ve tüm dersleri kalıcı olarak silinecek.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Sil", style: "destructive", onPress: () => void runClear() },
      ],
    );

  const resend = (entry: LessonHistoryEntry) =>
    retry.mutate(entry, {
      onSuccess: onOpen,
      onError: (error) =>
        Alert.alert("Gönderilemedi", friendlyError(error).message),
    });

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label" className="text-foreground-muted">
          Son sorular
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Son soruları temizle"
          onPress={confirmClear}
          hitSlop={8}
        >
          <Text variant="label" className="text-foreground-muted">
            Temizle
          </Text>
        </Pressable>
      </View>
      {entries.map((entry) => (
        <LessonRow
          key={entry.id}
          entry={entry}
          onPress={() => onOpen(entry.id)}
          onDelete={() => confirmDelete(entry)}
          actions={
            entry.status === "failed" && (
              <>
                {canRetry(entry) && (
                  <Button
                    label="Tekrar dene"
                    size="sm"
                    loading={
                      retry.isPending && retry.variables?.id === entry.id
                    }
                    disabled={retry.isPending}
                    onPress={() => resend(entry)}
                  />
                )}
                <Button
                  label={
                    entry.error.kind === "gone" ? "Listeden kaldır" : "Sil"
                  }
                  size="sm"
                  variant="secondary"
                  onPress={() => confirmDelete(entry)}
                />
              </>
            )
          }
        />
      ))}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deleteFailure(error: unknown): string {
  const { kind, message } = friendlyError(error);
  return kind === "offline" || kind === "busy"
    ? message
    : "Ders şu an silinemedi. Biraz sonra tekrar dene.";
}
