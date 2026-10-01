import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

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
 * Painter tabs: Home · Points · Scan · Rewards · Nearby. Scan is raised in brass in the
 * middle — it is the one thing a painter opens the app to do.
 */
export default function PainterTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.fgMute,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.rule, height: 64 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, size }) =>
              tab.primary ? (
                <View style={[styles.scan, { backgroundColor: colors.accent }]}>
                  <Feather name={tab.icon} color={colors.accentOn} size={26} />
                </View>
              ) : (
                <Feather name={tab.icon} color={color} size={size} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scan: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
});
