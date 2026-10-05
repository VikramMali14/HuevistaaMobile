import Feather from "@expo/vector-icons/Feather";
import { useNetInfo } from "@react-native-community/netinfo";
import { StyleSheet, View } from "react-native";

import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

import { Text } from "./Text";

/**
 * X1: a slim bar while the phone has no connection. <Screen> renders it at the top of
 * every page, inside the safe area and in the flow of the page — never over content.
 */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const { colors } = useTheme();

  // `null` means "not known yet" — say nothing until we know.
  if (isConnected !== false) return null;

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.rule }]}
      accessibilityLiveRegion="polite"
    >
      <Feather name="wifi-off" size={14} color={colors.fgSoft} />
      <Text variant="small" tone="soft">
        {t("offline.banner")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: hairline,
  },
});
