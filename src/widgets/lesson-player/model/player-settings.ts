import { File, Paths } from "expo-file-system";
import { useState } from "react";
import { Platform } from "react-native";

/**
 * The student's player choices, kept on the device: subtitles on or off.
 * Read synchronously so the player opens with the saved choice.
 */
export function usePlayerSettings() {
  const [settings, setSettings] = useState(readSettings);
  const update = (patch: Partial<PlayerSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
  };
  return [settings, update] as const;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Subtitles start on: easier to follow the numbers, and usable without sound. */
const DEFAULTS: PlayerSettings = { captions: true };
const STORAGE_KEY = "solver.player-settings";

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSettings(): PlayerSettings {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(STORAGE_KEY)
        : settingsFile().exists
          ? settingsFile().textSync()
          : null;
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PlayerSettings>;
    return {
      captions:
        typeof parsed.captions === "boolean"
          ? parsed.captions
          : DEFAULTS.captions,
    };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(settings: PlayerSettings) {
  try {
    const json = JSON.stringify(settings);
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(STORAGE_KEY, json);
      return;
    }
    const file = settingsFile();
    if (!file.exists) file.create();
    file.write(json);
  } catch {
    // Not saved: the choice still applies to this lesson.
  }
}

function settingsFile(): File {
  return new File(Paths.document, "player-settings.json");
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSettings {
  captions: boolean;
}
