import { Pressable, StyleSheet } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Read after the label (e.g. what the choice does). */
  accessibilityHint?: string;
  testID?: string;
}

/**
 * A filter pill (the website's `.hv-studio-pill`). Chosen is inverted — ink on paper
 * turned round — like the Segmented control, so it reads at a glance without colour.
 */
export function Chip({ label, selected, onPress, disabled, accessibilityHint, testID }: ChipProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.fg : pressed ? colors.surfaceSoft : colors.surface,
          borderColor: selected ? colors.fg : colors.ruleStrong,
          opacity: disabled && !selected ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.bg : colors.fgSoft }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: 14, justifyContent: "center", borderWidth: hairline },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
});
