import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { hairline, minTouch, useTheme, type Palette } from "@/theme";

import { Text } from "./Text";

/**
 * Mapped from the website's buttons (globals.css):
 *
 *   primary   ← .btn-brass  brass fill, ink text
 *   secondary ← .btn-ghost  no fill, ink text, strong hairline
 *   danger    ← .btn-warm   warm fill, white text — the destructive action
 *   ghost     ← a text link in the brass text cut, no box
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** A Feather icon name shown before the label. */
  icon?: ComponentProps<typeof Feather>["name"];
  /** Stretch to the full width (default) or hug the label. */
  block?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

interface Look {
  bg: keyof Palette | "transparent";
  fg: keyof Palette | "white";
  border: keyof Palette | "transparent";
  /** Pressed feedback: fade a fill (the website's hover opacity), or raise a box. */
  pressed: "fade" | "raise";
}

const looks: Record<ButtonVariant, Look> = {
  // Brass is a pale metal, so the text on it is ink — never white (6.2:1).
  primary: { bg: "accent", fg: "accentOn", border: "accent", pressed: "fade" },
  secondary: { bg: "transparent", fg: "fg", border: "ruleStrong", pressed: "raise" },
  ghost: { bg: "transparent", fg: "accentText", border: "transparent", pressed: "raise" },
  danger: { bg: "warmFill", fg: "white", border: "warmFill", pressed: "fade" },
};

/**
 * The app's button: a capsule, like the website's `.btn`. One `primary` per screen —
 * brass is used sparingly.
 *
 * Disabled is DRAINED, not just faded, exactly as on the website: a faded brass button
 * still reads as a live primary action that does nothing when pressed.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  block = true,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const look = looks[variant];
  const inactive = disabled || loading;
  const paint = (key: keyof Palette | "transparent" | "white") =>
    key === "transparent" ? "transparent" : key === "white" ? "#ffffff" : colors[key];

  // Loading keeps the button's own colours (it is busy, not unavailable).
  const drained = disabled && !loading;
  const bg = drained ? (variant === "ghost" ? "transparent" : colors.surfaceSoft) : paint(look.bg);
  const fg = drained ? colors.fgMute : paint(look.fg);
  const border = drained ? (variant === "ghost" ? "transparent" : colors.ruleStrong) : paint(look.border);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radius.pill,
          backgroundColor: pressed && look.pressed === "raise" ? colors.surfaceSoft : bg,
          borderColor: border,
          opacity: drained ? 0.55 : pressed && look.pressed === "fade" ? 0.85 : 1,
          alignSelf: block ? "stretch" : "flex-start",
        },
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={18} color={fg} /> : null}
            <Text variant="bodyStrong" style={{ color: fg }} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Math.max(minTouch, 52),
    paddingHorizontal: 26,
    justifyContent: "center",
    borderWidth: hairline,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
});
