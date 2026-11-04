import { Pressable, StyleSheet, View } from "react-native";

import { fonts, hairline, minTouch, useTheme } from "@/theme";

import { Text } from "./Text";

export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Tighter options, for three longer labels that must fit a 360 dp phone across. */
  compact?: boolean;
}

/**
 * Two or three choices side by side — mapped from the website's `.hv-plan-tabs`: a
 * capsule with a strong hairline on the surface, and the chosen option inverted (ink
 * capsule, paper text).
 */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, compact = false }: SegmentedProps<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
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
            style={[
              styles.item,
              compact && styles.itemCompact,
              { borderRadius: radius.pill, backgroundColor: on ? colors.fg : "transparent" },
            ]}
          >
            <Text style={[styles.label, compact && styles.labelCompact, { color: on ? colors.bg : colors.fgSoft }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignSelf: "flex-start", padding: 4, gap: 4, borderWidth: hairline },
  item: { minHeight: minTouch - 8, paddingHorizontal: 18, justifyContent: "center" },
  // Compact: the whole width, shared evenly, so three longer labels never spill past the
  // capsule on a narrow phone; a label too long for its share wraps rather than overflows.
  wrapCompact: { alignSelf: "stretch" },
  itemCompact: { flex: 1, paddingHorizontal: 6, alignItems: "center" },
  labelCompact: { textAlign: "center" },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
});
