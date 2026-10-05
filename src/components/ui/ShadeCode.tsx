import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";

import { t } from "@/i18n";

import { Text } from "./Text";
import { useToast } from "./Toast";

/**
 * The code a customer reads out at the counter — large, tabular, and copied on a long
 * press (with a toast saying so).
 */
export function ShadeCode({ code, size = "large" }: { code: string; size?: "large" | "medium" }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toast.show(t("shade.copied"), "success");
    } catch {
      // Nothing to do: the code is on screen to read out.
    }
  };
  return (
    <Pressable
      onLongPress={copy}
      accessibilityRole="button"
      accessibilityLabel={`${t("shade.code")} ${code.split("").join(" ")}`}
      accessibilityHint={t("shade.copyHint")}
      hitSlop={8}
    >
      <Text variant="code" style={size === "large" ? styles.large : styles.medium} selectable>
        {code}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  large: { fontSize: 34, lineHeight: 40, letterSpacing: 1 },
  medium: { fontSize: 22, lineHeight: 28, letterSpacing: 0.5 },
});
