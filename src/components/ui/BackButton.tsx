import Feather from "@expo/vector-icons/Feather";
import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { t } from "@/i18n";
import { minTouch, useTheme } from "@/theme";

/**
 * The back arrow at the top of a pushed screen. Goes back when there is somewhere to go
 * back to; otherwise to `fallback` (a screen opened straight from a link has no history).
 */
export function BackButton({ fallback = "/welcome", onPress }: { fallback?: Href; onPress?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      >
        <Feather name="arrow-left" size={22} color={colors.fg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginLeft: -12 },
  button: { width: minTouch, height: minTouch, alignItems: "center", justifyContent: "center" },
});
