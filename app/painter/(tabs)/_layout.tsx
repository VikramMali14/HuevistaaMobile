import Feather from "@expo/vector-icons/Feather";
import { Tabs, type BottomTabBarButtonProps } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { fonts, useTheme } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

const tabs: { name: string; label: string; icon: IconName; primary?: boolean }[] = [
  { name: "index", label: t("tabs.home"), icon: "home" },
  { name: "points", label: t("tabs.points"), icon: "star" },
  { name: "scan", label: t("tabs.scan"), icon: "maximize", primary: true },
  { name: "rewards", label: t("tabs.rewards"), icon: "gift" },
  { name: "nearby", label: t("tabs.nearby"), icon: "map-pin" },
];

/**
 * The Scan tab: a brass capsule that fills its whole slot. A custom button rather than a
 * big icon, because the navigator boxes tab icons at 24–31 px and anything larger spills
 * out of the box (and is clipped on some Android phones).
 */
function ScanTabButton({ onPress, onLongPress, accessibilityState, accessibilityLabel, testID, style }: BottomTabBarButtonProps) {
  const { colors } = useTheme();
  const selected = Boolean(accessibilityState?.selected);
  return (
    <Pressable
      onPress={(e) => onPress?.(e)}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel ?? t("tabs.scan")}
      testID={testID}
      style={({ pressed }) => [style, styles.scanItem, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.scanDisc, { backgroundColor: colors.accent }]}>
        <Feather name="maximize" color={colors.accentOn} size={20} />
      </View>
      <Text
        style={[styles.scanLabel, { color: selected ? colors.accentText : colors.fgMute }]}
        maxFontSizeMultiplier={1.4}
      >
        {t("tabs.scan")}
      </Text>
    </Pressable>
  );
}

/**
 * Painter tabs: Home · Points · Scan · Rewards · Nearby. Scan sits in the middle in
 * brass — it is the one thing a painter opens the app to do.
 */
export default function PainterTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.fgMute,
        // No fixed height: the navigator adds the bottom safe-area inset itself.
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.rule },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, size }) => <Feather name={tab.icon} color={color} size={size} />,
            ...(tab.primary ? { tabBarButton: (props) => <ScanTabButton {...props} /> } : null),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  scanDisc: { width: 48, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  scanLabel: { fontFamily: fonts.semibold, fontSize: 12 },
});
