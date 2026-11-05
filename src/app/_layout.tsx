import "@/app-shell/bootstrap";

import { Stack } from "expo-router";

import { AppProviders } from "@/app-shell/providers";
import { useAppReady } from "@/app-shell/use-app-ready";
import { APP } from "@/shared/lib/app-tokens";

export default function RootLayout() {
  const ready = useAppReady();
  if (!ready) return null;

  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: APP.background },
        }}
      />
    </AppProviders>
  );
}
