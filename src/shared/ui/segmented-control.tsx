import { Pressable, View } from "react-native";

import { cn } from "@/shared/lib/cn";

import { Text } from "./text";

/** Pill-shaped tabs for switching between a few views of one screen. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-pill bg-surface p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={cn(
              "flex-1 items-center rounded-pill py-2.5",
              selected && "bg-primary",
            )}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              className={cn(
                "font-inter-semibold",
                selected ? "text-primary-foreground" : "text-foreground-muted",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
