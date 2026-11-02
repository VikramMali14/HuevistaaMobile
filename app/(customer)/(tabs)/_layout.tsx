import Feather from "@expo/vector-icons/Feather";
import { usePathname } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";

import { t, type MessageKey } from "@/i18n";
import { tabLabelStyle, useTabBarOptions } from "@/navigation/tab-bar";
import { useTheme } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

// Labels are read as the tab bar draws (not when this file loads), so they follow the language.
const tabs: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: "home", label: "tabs.home", icon: "home" },
  { name: "studio", label: "tabs.studio", icon: "camera" },
  { name: "catalogue", label: "tabs.catalogue", icon: "droplet" },
  { name: "boards", label: "tabs.boards", icon: "layers" },
  // Painters and shops near you (C32). A tab, not a card on Home: whoever opens the app
  // to find a painter shouldn't have to scroll past their rooms to reach the search.
  { name: "nearby", label: "tabs.nearby", icon: "map-pin" },
  { name: "account", label: "tabs.account", icon: "user" },
];

/**
 * Customer tabs: Home · Studio · Catalogue · Boards · Nearby · Account (docs/01-product.md).
 *
 * The Shade Book (C34) and the Colour finder (C35) live in the Catalogue tab, beside the
 * shades — a switch at the top of all three screens — rather than as tabs of their own: seven
 * leave about 45 dp a label on a 360–390 dp phone, and "Shade Book" needs 63. Their routes have
 * no button of their own, and the Catalogue tab stays lit while either shows.
 */
export default function CustomerTabs() {
  const options = useTabBarOptions();
  const { colors } = useTheme();
  const pathname = usePathname();
  const inCatalogue = pathname === "/shade-book" || pathname === "/colour-finder";
  return (
    <Tabs screenOptions={options}>
      {tabs.map((tab) => {
        const lit = tab.name === "catalogue" && inCatalogue;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.label),
              tabBarButtonTestID: `tab-${tab.name}`,
              tabBarIcon: ({ color, size }) => <Feather name={tab.icon} color={lit ? colors.accentText : color} size={size} />,
              ...(lit ? { tabBarLabelStyle: [tabLabelStyle(), { color: colors.accentText }] } : {}),
            }}
          />
        );
      })}
      <Tabs.Screen name="shade-book" options={{ href: null, title: t("shadeBook.title") }} />
      <Tabs.Screen name="colour-finder" options={{ href: null, title: t("colourFinder.title") }} />
    </Tabs>
  );
}
