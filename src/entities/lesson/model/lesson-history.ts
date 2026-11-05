import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { requestJson } from "@/shared/api/request-json";

import type { Lesson } from "./types";

/** Recent lessons, newest first, kept only on this device (no accounts yet). */
export function useLessonHistory() {
  return useQuery({ queryKey: HISTORY_KEY, queryFn: readHistory });
}

/** Records a finished lesson at the top of the history. */
export function useRememberLesson() {
  const queryClient = useQueryClient();
  return async (lesson: Lesson) => {
    const history = await readHistory();
    const entry: LessonHistoryEntry = {
      id: lesson.id,
      title: numberedTitle(lesson.title, history),
      answer: lesson.answer,
      durationMs: lesson.audio.durationMs,
      createdAt: Date.now(),
    };
    const rest = history.filter((item) => item.id !== lesson.id);
    const next = [entry, ...rest].slice(0, MAX_ENTRIES);

    const file = historyFile();
    if (file) {
      if (!file.exists) file.create();
      file.write(JSON.stringify(next));
    }
    queryClient.setQueryData(HISTORY_KEY, next);
  };
}

/** Deletes every recent lesson: the list on this device and the lessons on the server. */
export function useClearLessonHistory() {
  const queryClient = useQueryClient();
  return async () => {
    const lessons = await readHistory();
    await Promise.all(
      lessons.map((lesson) =>
        requestJson(`/api/lessons/${lesson.id}`, { method: "DELETE" }).catch(
          () => undefined,
        ),
      ),
    );
    const file = historyFile();
    if (file?.exists) file.delete();
    queryClient.setQueryData(HISTORY_KEY, []);
    queryClient.removeQueries({ queryKey: ["lesson"] });
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = ["lesson-history"] as const;
const MAX_ENTRIES = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "Türkçe / Sözcükte Anlam" → "… 1", "… 2" as the same topic comes up again. */
function numberedTitle(title: string, history: LessonHistoryEntry[]): string {
  const pattern = new RegExp(`^${escapeRegExp(title)} (\\d+)$`);
  const used = history
    .map((entry) => pattern.exec(entry.title)?.[1])
    .filter((n) => n !== undefined)
    .map(Number);
  return `${title} ${Math.max(0, ...used) + 1}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readHistory(): Promise<LessonHistoryEntry[]> {
  const file = historyFile();
  if (!file?.exists) return [];
  try {
    return JSON.parse(await file.text()) as LessonHistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * The history file, created on first use (not at import time). The phone app
 * is the target; on web — used only for previewing the player — there is no
 * file system, so history is simply not kept.
 */
function historyFile(): File | null {
  return Platform.OS === "web"
    ? null
    : new File(Paths.document, "lesson-history.json");
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface LessonHistoryEntry {
  id: string;
  title: string;
  answer: string;
  durationMs: number;
  createdAt: number;
}
