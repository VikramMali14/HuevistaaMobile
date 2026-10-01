import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { minTouch, useTheme, type Palette } from "@/theme";

import { Text } from "./Text";

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
  fg: keyof Palette;
  border: keyof Palette | "transparent";
}

const looks: Record<ButtonVariant, Look> = {
  // Brass is a pale metal, so the text on it is ink — never white.
  primary: { bg: "accent", fg: "accentOn", border: "accent" },
  secondary: { bg: "transparent", fg: "fg", border: "ruleStrong" },
  ghost: { bg: "transparent", fg: "accentText", border: "transparent" },
  danger: { bg: "danger", fg: "fg", border: "danger" },
};

/**
 * The app's button: a capsule, like the website's `.btn`. One `primary` per screen —
 * brass is used sparingly.
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
  const color = (key: keyof Palette | "transparent") => (key === "transparent" ? "transparent" : colors[key]);
  // Danger fills carry ivory text in both themes.
  const fg = variant === "danger" ? "#f6f3ec" : colors[look.fg];

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
          backgroundColor: pressed && variant === "primary" ? colors.accentDeep : color(look.bg),
          borderColor: color(look.border),
          opacity: disabled ? 0.45 : pressed && variant !== "primary" ? 0.7 : 1,
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
    paddingHorizontal: 24,
    justifyContent: "center",
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
