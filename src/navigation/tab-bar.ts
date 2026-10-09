import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getLanguage } from "@/i18n";
import { fonts, hairline, useTheme } from "@/theme";

/**
 * Height of the tab bar's content, above the phone's bottom inset.
 *
 * The navigator's default is 49, sized for 10px system-font labels: its item is 5px
 * padding + a 28px icon box + the label + 5px padding. Inter at 11px sets taller than
 * that, and at 49 the bottom of every label was clipped (seen in the browser preview).
 * 60 holds icon and label with room for the phone's larger text settings.
 */
export const TAB_BAR_CONTENT_HEIGHT = 60;

/**
 * The tab label: Inter 600 11/14 — an explicit line height so nothing is clipped. In
 * Hindi 11/17: Devanagari's vowel signs reach further above and below. Read as the bar
 * draws (a new language remounts it).
 */
export function tabLabelStyle() {
  return { fontFamily: fonts.semibold, fontSize: 11, lineHeight: getLanguage() === "hi" ? 17 : 14 } as const;
}

/**
 * Screen options both tab bars share (customer and painter), so the two can never
 * drift apart. The height ADDS the bottom safe-area inset: a fixed height alone would
 * drop it and let the home indicator cover the tabs on gesture-navigation phones.
 */
export function useTabBarOptions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.accentText,
    tabBarInactiveTintColor: colors.fgMute,
    tabBarStyle: {
      backgroundColor: colors.bg,
      borderTopColor: colors.rule,
      borderTopWidth: hairline,
      height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
    },
    tabBarLabelStyle: tabLabelStyle(),
    tabBarItemStyle: { paddingTop: 7 },
  };
}
