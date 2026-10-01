import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { hairline, useTheme } from "@/theme";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** A lit brass hairline along the top edge — for the one card that matters most. */
  lit?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A surface separated by a hairline, not a shadow. */
export function Card({ children, onPress, accessibilityLabel, lit = false, style }: CardProps) {
  const { colors, radius, space } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.rule,
    borderTopColor: lit ? colors.accent : colors.rule,
    padding: space.lg,
  };

  if (!onPress) return <View style={[styles.card, base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        base,
        pressed && { backgroundColor: colors.surfaceSoft },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: hairline, gap: 8 },
});
