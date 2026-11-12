import { Alert02Icon } from "@hugeicons/core-free-icons";
import { View } from "react-native";

import { APP } from "@/shared/lib/app-tokens";

import { Button } from "./button";
import { Icon } from "./icon";
import { Text } from "./text";

/**
 * Full-screen "something is wrong" state: a friendly message and what the
 * student can do about it (first action is the main one).
 */
export function ProblemView({
  title,
  message,
  actions,
}: {
  title?: string;
  message: string;
  actions: ProblemAction[];
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <Icon icon={Alert02Icon} size={28} color={APP.destructive} />
      {title && (
        <Text variant="heading" className="text-center">
          {title}
        </Text>
      )}
      <Text
        variant="body"
        className="text-center"
        accessibilityLiveRegion="polite"
      >
        {message}
      </Text>
      <View className="gap-3 self-stretch">
        {actions.map((action, i) => (
          <Button
            key={action.label}
            label={action.label}
            variant={i === 0 ? "primary" : "secondary"}
            loading={action.loading}
            onPress={action.onPress}
          />
        ))}
      </View>
    </View>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProblemAction {
  label: string;
  onPress: () => void;
  loading?: boolean;
}
