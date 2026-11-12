import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useResumePendingLessons } from "@/entities/lesson";
import { queryClient } from "@/shared/api/query-client";

/** App-wide providers around every route. */
export function AppProviders({ children }: { children: ReactNode }) {
  // Lessons still being made keep polling from app start, on every screen.
  useResumePendingLessons();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          {children}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
