// Side effects that must run once, before the first render. Imported first
// from the root layout.
import "@/global.css";
import "@/shared/lib/nativewind-interop";

import * as SplashScreen from "expo-splash-screen";

import { lockAppToPortrait } from "@/shared/lib/use-orientation-lock";

// Keep the native splash up until `useAppReady` reports the fonts are in.
void SplashScreen.preventAutoHideAsync();

// Start upright even if the app was closed on a landscape lesson.
lockAppToPortrait();
