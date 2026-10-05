import { Pressable, StyleSheet, View } from "react-native";

import { fonts, hairline, minTouch, useTheme } from "@/theme";

import { Text } from "./Text";

export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/**
 * Two or three choices side by side — mapped from the website's `.hv-plan-tabs`: a
 * capsule with a strong hairline on the surface, and the chosen option inverted (ink
 * capsule, paper text).
 */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.wrap,
        { borderColor: colors.ruleStrong, borderRadius: radius.pill, backgroundColor: colors.surface },
      ]}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            style={[styles.item, { borderRadius: radius.pill, backgroundColor: on ? colors.fg : "transparent" }]}
          >
            <Text style={[styles.label, { color: on ? colors.bg : colors.fgSoft }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignSelf: "flex-start", padding: 4, gap: 4, borderWidth: hairline },
  item: { minHeight: minTouch - 8, paddingHorizontal: 18, justifyContent: "center" },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
});
