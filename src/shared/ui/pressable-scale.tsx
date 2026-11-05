import type { ReactNode } from "react";
import { Pressable, type PressableProps, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * Touch target with tactile feedback: shrinks slightly while pressed and
 * springs back; dims a touch on hover (web, iPad pointer). `className` styles
 * a plain inner View — NativeWind doesn't style Reanimated views — and the
 * animated wrapper scales it as a whole.
 */
export function PressableScale({
  children,
  className,
  disabled,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(PRESSED_SCALE, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      onHoverIn={() => {
        opacity.value = withTiming(0.85, { duration: 120 });
      }}
      onHoverOut={() => {
        opacity.value = withTiming(1, { duration: 160 });
      }}
      {...props}
    >
      <Animated.View style={[animatedStyle, disabled && { opacity: 0.4 }]}>
        <View className={className}>{children}</View>
      </Animated.View>
    </Pressable>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const PRESSED_SCALE = 0.97;
const SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

// ── Types ────────────────────────────────────────────────────────────────────

export interface PressableScaleProps
  extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  className?: string;
}
