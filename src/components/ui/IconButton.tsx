import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface IconButtonProps {
  icon: ComponentProps<typeof Feather>["name"];
  /** Said by the screen reader; there is no visible label. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `onPhoto`: a translucent paper disc that reads on any picture (the studio's top bar). */
  variant?: "plain" | "onPhoto";
  /** A small count on the corner (the board tray). */
  badge?: number;
  testID?: string;
}

/** A round 48 dp button with one icon (docs/02). */
export function IconButton({ icon, label, onPress, disabled, variant = "plain", badge, testID }: IconButtonProps) {
  const { colors } = useTheme();
  const onPhoto = variant === "onPhoto";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: onPhoto ? `${colors.bg}e6` : pressed ? colors.surfaceSoft : "transparent",
          borderColor: onPhoto ? colors.rule : "transparent",
          opacity: disabled ? 0.4 : pressed && onPhoto ? 0.8 : 1,
        },
      ]}
    >
      <Feather name={icon} size={22} color={colors.fg} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.accentOn }]}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: hairline },
  badge: { position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
});
