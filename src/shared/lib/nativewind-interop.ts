import { cssInterop } from "nativewind";
import { SafeAreaView } from "react-native-safe-area-context";

// NativeWind only maps `className` on React Native's own components. Third-party
// ones that forward `style` must be registered once, before the first render.
cssInterop(SafeAreaView, { className: "style" });
