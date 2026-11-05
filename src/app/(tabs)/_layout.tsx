import { BookOpen01Icon, Home01Icon } from "@hugeicons/core-free-icons";
import { Tabs } from "expo-router";

import { APP, APP_FONT } from "@/shared/lib/app-tokens";
import { Icon } from "@/shared/ui";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="examples"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: APP.foreground,
        tabBarInactiveTintColor: APP.foregroundMuted,
        tabBarStyle: {
          backgroundColor: APP.background,
          borderTopColor: APP.border,
        },
        tabBarLabelStyle: { fontFamily: APP_FONT.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: APP.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
          title: "Ana sayfa",
          tabBarIcon: ({ color }) => (
            <Icon icon={Home01Icon} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="examples"
        options={{
          title: "Örnekler",
          tabBarIcon: ({ color }) => (
            <Icon icon={BookOpen01Icon} size={22} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
