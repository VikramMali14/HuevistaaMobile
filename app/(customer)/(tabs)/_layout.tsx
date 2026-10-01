import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";

import { t } from "@/i18n";
import { fonts, useTheme } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

const tabs: { name: string; label: string; icon: IconName }[] = [
  { name: "home", label: t("tabs.home"), icon: "home" },
  { name: "studio", label: t("tabs.studio"), icon: "camera" },
  { name: "catalogue", label: t("tabs.catalogue"), icon: "droplet" },
  { name: "boards", label: t("tabs.boards"), icon: "layers" },
  { name: "account", label: t("tabs.account"), icon: "user" },
];

/** Customer tabs: Home · Studio · Catalogue · Boards · Account (docs/01-product.md). */
export default function CustomerTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.fgMute,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.rule },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, size }) => <Feather name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
