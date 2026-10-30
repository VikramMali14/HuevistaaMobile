import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { Text, type ColorValue } from "react-native";

import { t, type MessageKey } from "@/i18n";
import { tabLabelStyle, useTabBarOptions } from "@/navigation/tab-bar";

type IconName = ComponentProps<typeof Feather>["name"];

// Labels are read as the tab bar draws (not when this file loads), so they follow the language.
const tabs: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: "home", label: "tabs.home", icon: "home" },
  { name: "studio", label: "tabs.studio", icon: "camera" },
  { name: "catalogue", label: "tabs.catalogue", icon: "droplet" },
  // Combinations of those shades painted on real houses, beside the shades themselves: the
  // first few free, the rest opened by a 24-hour pass.
  { name: "shade-book", label: "tabs.shadeBook", icon: "book-open" },
  { name: "boards", label: "tabs.boards", icon: "layers" },
  // Painters and shops near you (C32). A tab, not a card on Home: whoever opens the app
  // to find a painter shouldn't have to scroll past their rooms to reach the search.
  { name: "nearby", label: "tabs.nearby", icon: "map-pin" },
  { name: "account", label: "tabs.account", icon: "user" },
];

/**
 * A tab's label on one line that shrinks a little rather than being cut short: seven tabs
 * on a 360 dp phone leave about 51 dp each, and "Catalogue" and "Shade Book" set wider than
 * that at 11 px.
 */
function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text
      style={[tabLabelStyle(), { color, textAlign: "center" }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.4}
    >
      {children}
    </Text>
  );
}

/** Customer tabs: Home · Studio · Catalogue · Shade Book · Boards · Nearby · Account (docs/01-product.md). */
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
            tabBarLabel: ({ color, children }) => <TabLabel color={color}>{children}</TabLabel>,
            tabBarIcon: ({ color, size }) => <Feather name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
