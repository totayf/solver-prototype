import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { View } from "react-native";

import { APP } from "@/shared/lib/app-tokens";
import { Icon, PressableScale, Text } from "@/shared/ui";

import {
  EXAMPLE_MODELS,
  type ExampleQuestion,
  TOOL_LABELS,
} from "../model/types";

/** A catalog question: subject / topic, tool tag, ready models. */
export function ExampleRow({
  question,
  onPress,
}: {
  question: ExampleQuestion;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card border border-border bg-surface p-3"
    >
      <View className="flex-1 gap-1">
        <Text variant="label" numberOfLines={2}>
          {question.subject} / {question.topic}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {question.tools
            .filter((tool) => TOOL_LABELS[tool])
            .map((tool) => (
              <View key={tool} className="rounded-pill bg-primary px-2 py-0.5">
                <Text
                  variant="caption"
                  className="text-[11px] text-primary-foreground"
                >
                  {TOOL_LABELS[tool]}
                </Text>
              </View>
            ))}
          <Text variant="caption" className="text-foreground-muted">
            {EXAMPLE_MODELS.filter((model) => question.lessons[model.id])
              .map((model) =>
                model.label.replace(/^(Gemini 4|Claude|GPT-6\.1) /, ""),
              )
              .join(" · ")}
          </Text>
        </View>
      </View>
      <Icon icon={ArrowRight01Icon} size={20} color={APP.foregroundMuted} />
    </PressableScale>
  );
}
