import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/ui";
import { fonts, useTheme } from "@/theme";

export interface StepNumberProps {
  n: number;
  /** "ink" on the page; "onAccent" inside a brass button, where ink is the fill. */
  tone?: "ink" | "onAccent";
  style?: StyleProp<ViewStyle>;
}

/**
 * One of Paint's three numbered steps — 1 the walls, 2 the colours, 3 Save — as a
 * filled disc with a numeral in it, the same disc the website's studio and the
 * "How it works" sheet use.
 *
 * Numerals are read by people words are not, and three of them down the left of the
 * dock say what order the screen is used in without a line of text: the dock keeps its
 * height (a taller dock would shrink the room, and a resize starts the GPU over).
 * Hidden from screen readers, which hear each control's own name instead.
 */
export function StepNumber({ n, tone = "ink", style }: StepNumberProps) {
  const { colors } = useTheme();
  const onAccent = tone === "onAccent";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.disc, { backgroundColor: onAccent ? colors.accentOn : colors.fg }, style]}
      testID={`step-${n}`}
    >
      <Text maxFontSizeMultiplier={1.2} style={[styles.numeral, { color: onAccent ? colors.accent : colors.bg }]}>
        {n}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  numeral: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16 },
});
