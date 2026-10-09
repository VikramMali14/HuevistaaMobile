import { StyleSheet, View } from "react-native";

import { fonts, useTheme } from "@/theme";

import { Text } from "./Text";

export type PillTone = "plain" | "accent" | "success" | "warning" | "danger";

/**
 * A small status word in a capsule — "On its way", "Delivered", "3 days" (the painter
 * website's `.pill` tones). Never the only way a state is shown: the word carries it.
 */
export function Pill({ label, tone = "plain", testID }: { label: string; tone?: PillTone; testID?: string }) {
  const { colors, radius } = useTheme();
  const fill: Record<PillTone, string> = {
    plain: colors.surfaceSoft,
    accent: "rgba(192,139,78,0.16)",
    success: "rgba(78,122,82,0.18)",
    warning: "rgba(216,166,87,0.18)",
    danger: "rgba(194,64,42,0.16)",
  };
  const ink: Record<PillTone, string> = {
    plain: colors.fgSoft,
    accent: colors.accentText,
    success: colors.successText,
    warning: colors.accentText,
    danger: colors.dangerText,
  };
  return (
    <View style={[styles.pill, { backgroundColor: fill[tone], borderRadius: radius.pill }]} testID={testID}>
      <Text variant="small" style={{ color: ink[tone], fontFamily: fonts.semibold }} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
});
