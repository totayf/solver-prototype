import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the app's API lives. With `EXPO_PUBLIC_API_URL` set (APK builds) it is
 * Kovan's hosted Dev Solver API; otherwise the local Expo dev server's own API
 * routes (same origin on web, the dev server's host on a device).
 */
export function apiOrigin(): string {
  if (REMOTE_API) return REMOTE_API;
  if (Platform.OS === "web") return "";
  const host = Constants.expoConfig?.hostUri;
  return host ? `http://${host}` : "";
}

/** Full URL for an API path written as the local routes name it (`/api/lessons`). */
export function apiUrl(path: string): string {
  return REMOTE_API
    ? `${REMOTE_API}${path.replace(/^\/api\//, "/api/dev-solver/")}`
    : apiOrigin() + path;
}

/** Sent as `x-solver-key` so only this app can use the hosted API. */
export const API_KEY = process.env.EXPO_PUBLIC_SOLVER_KEY;

const REMOTE_API = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
