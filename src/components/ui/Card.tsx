import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { hairline, useTheme } from "@/theme";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Press and hold — a room card's menu. Said to the screen reader as an action. */
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** What a press and hold does, for the screen reader. */
  accessibilityHint?: string;
  /** A lit brass hairline along the top edge — for the one card that matters most. */
  lit?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A surface separated by a hairline, not a shadow. */
export function Card({ children, onPress, onLongPress, accessibilityLabel, accessibilityHint, lit = false, style }: CardProps) {
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
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={onLongPress ? [{ name: "longpress" }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && onLongPress?.()}
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
