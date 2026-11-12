import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** False while the app is in the background (or inactive, e.g. a call). */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  return active;
}
