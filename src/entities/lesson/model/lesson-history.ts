import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { queryClient } from "@/shared/api/query-client";

import {
  droppedUploads,
  type LessonHistoryEntry,
  normalizeHistory,
} from "./history-model";

/** Recent lessons, newest first, kept only on this device (no accounts yet). */
export function useLessonHistory() {
  return useQuery({ queryKey: HISTORY_KEY, queryFn: readHistory });
}

export async function readHistory(): Promise<LessonHistoryEntry[]> {
  const file = historyFile();
  if (!file) return memoryHistory;
  if (!file.exists) return [];
  try {
    return normalizeHistory(JSON.parse(await file.text()));
  } catch {
    return [];
  }
}

/**
 * Read → change → write, one change at a time (the poller may finish several
 * lessons at once). Updates the cached list and deletes photo copies no
 * entry needs any more. A change that returns the same list writes nothing.
 */
export function updateHistory(
  change: (history: LessonHistoryEntry[]) => LessonHistoryEntry[],
): Promise<LessonHistoryEntry[]> {
  const run = queue.then(async () => {
    const before = await readHistory();
    const after = change(before);
    if (after === before) return before;
    writeHistory(after);
    queryClient.setQueryData(HISTORY_KEY, after);
    for (const uri of droppedUploads(before, after)) deleteUpload(uri);
    return after;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Keeps the exact JPEG that was sent, so "Tekrar dene" re-sends the same
 * bytes (the server joins the running job instead of paying twice) and the
 * history row has a thumbnail. Returns its URI, or undefined if it couldn't
 * be stored (the lesson still works, only the retry needs a new photo).
 */
export function saveUpload(id: string, base64: string): string | undefined {
  if (Platform.OS === "web") return `data:image/jpeg;base64,${base64}`;
  try {
    const dir = uploadsDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${safeName(id)}.jpg`);
    file.write(base64, { encoding: "base64" });
    return file.uri;
  } catch (error) {
    console.warn("[lesson-history] could not keep the photo", error);
    return undefined;
  }
}

/** The stored photo as base64, or null when it's gone. */
export async function readUpload(uri: string): Promise<string | null> {
  if (uri.startsWith("data:")) return uri.slice(uri.indexOf(",") + 1);
  try {
    const file = new File(uri);
    return file.exists ? await file.base64() : null;
  } catch {
    return null;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

export const HISTORY_KEY = ["lesson-history"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();
/** Web (player preview only) has no file system: history lives for the session. */
let memoryHistory: LessonHistoryEntry[] = [];

function writeHistory(history: LessonHistoryEntry[]) {
  const file = historyFile();
  if (!file) {
    memoryHistory = history;
    return;
  }
  if (!file.exists) file.create();
  file.write(JSON.stringify(history));
}

function deleteUpload(uri: string) {
  if (uri.startsWith("data:")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A leftover photo in the app's own folder is harmless.
  }
}

/**
 * The history file, created on first use (not at import time). On web —
 * used only for previewing the player — there is no file system.
 */
function historyFile(): File | null {
  return Platform.OS === "web"
    ? null
    : new File(Paths.document, "lesson-history.json");
}

function uploadsDir(): Directory {
  return new Directory(Paths.document, "lesson-uploads");
}

function safeName(id: string): string {
  return id.replace(/[^\w-]/g, "_");
}
