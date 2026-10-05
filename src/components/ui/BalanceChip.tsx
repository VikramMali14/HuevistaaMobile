import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

/** "3 rooms left" · "12 AI credits" — a balance you can tap through to (C27). */
export function BalanceChip({
  label,
  icon,
  onPress,
  testID,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          borderColor: colors.ruleBrass,
          backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
        },
      ]}
    >
      <Feather name={icon} size={15} color={colors.accentText} />
      <Text style={[styles.label, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: hairline,
  },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
});
