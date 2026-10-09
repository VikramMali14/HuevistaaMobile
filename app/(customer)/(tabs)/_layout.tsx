import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";

import { t, type MessageKey } from "@/i18n";
import { useTabBarOptions } from "@/navigation/tab-bar";

type IconName = ComponentProps<typeof Feather>["name"];

// Labels are read as the tab bar draws (not when this file loads), so they follow the language.
const tabs: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: "home", label: "tabs.home", icon: "home" },
  { name: "studio", label: "tabs.studio", icon: "camera" },
  { name: "catalogue", label: "tabs.catalogue", icon: "droplet" },
  { name: "boards", label: "tabs.boards", icon: "layers" },
  { name: "account", label: "tabs.account", icon: "user" },
];

/** Customer tabs: Home · Studio · Catalogue · Boards · Account (docs/01-product.md). */
export default function CustomerTabs() {
  const options = useTabBarOptions();
  return (
    <Tabs screenOptions={options}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color, size }) => <Feather name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
