import Feather from "@expo/vector-icons/Feather";
import { useNetInfo } from "@react-native-community/netinfo";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { Text } from "./Text";

/** X1: a slim banner across the top while the phone has no connection. */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // `null` means "not known yet" — say nothing until we know.
  if (isConnected !== false) return null;

  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: colors.surfaceSoft, borderBottomColor: colors.rule }]}
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
