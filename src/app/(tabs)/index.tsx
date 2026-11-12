import {
  Alert02Icon,
  Camera01Icon,
  Image02Icon,
} from "@hugeicons/core-free-icons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { pickQuestionImage } from "@/features/create-lesson";
import { friendlyError } from "@/shared/api/friendly-error";
import { APP } from "@/shared/lib/app-tokens";
import { useNavigationLock } from "@/shared/lib/use-navigation-lock";
import { Button, Icon, Screen, Text } from "@/shared/ui";
import { LessonHistory } from "@/widgets/lesson-history";

// Photo solving is switched off for the shared build (examples only).
const SOLVING_ENABLED = false;

export default function HomePage() {
  return SOLVING_ENABLED ? <SolveHome /> : <Redirect href="/examples" />;
}

function SolveHome() {
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const navigate = useNavigationLock();

  const start = async (source: "camera" | "library") => {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const image = await pickQuestionImage(source);
      if (image) {
        navigate(() =>
          router.push({
            pathname: "/crop",
            params: {
              uri: image.uri,
              width: String(image.width),
              height: String(image.height),
            },
          }),
        );
      }
    } catch (e) {
      setError(friendlyError(e).message);
    } finally {
      setPicking(false);
    }
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerClassName="gap-8 pb-10 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3">
          <Text
            variant="caption"
            className="font-inter-medium tracking-[2px] text-foreground-muted"
          >
            SOLVER
          </Text>
          <Text variant="title">
            Sorunun fotoğrafını çek,{"\n"}hocan anlatsın.
          </Text>
          <Text variant="body" className="text-foreground-muted">
            Altını çizerek, eleyerek, sesli anlatımla — gerçek bir hoca gibi.
          </Text>
        </View>

        <View className="gap-3">
          <Button
            label="Fotoğraf çek"
            icon={Camera01Icon}
            disabled={picking}
            onPress={() => void start("camera")}
          />
          <Button
            label="Galeriden seç"
            icon={Image02Icon}
            variant="secondary"
            disabled={picking}
            onPress={() => void start("library")}
          />
          {error && (
            <View className="flex-row items-center gap-2 rounded-card border border-border bg-surface p-3">
              <Icon icon={Alert02Icon} size={20} color={APP.destructive} />
              <Text variant="caption" className="flex-1 text-foreground">
                {error}
              </Text>
            </View>
          )}
        </View>

        <LessonHistory
          onOpen={(id) =>
            navigate(() =>
              router.push({ pathname: "/lesson/[id]", params: { id } }),
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
