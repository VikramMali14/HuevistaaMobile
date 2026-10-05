import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { hairline, useTheme, type Palette } from "@/theme";

import { Text } from "./Text";

export type BannerTone = "info" | "success" | "warning" | "danger";

const look: Record<BannerTone, { icon: "info" | "check-circle" | "alert-triangle" | "alert-circle"; ink: keyof Palette }> = {
  info: { icon: "info", ink: "fgSoft" },
  success: { icon: "check-circle", ink: "successText" },
  warning: { icon: "alert-triangle", ink: "warmText" },
  danger: { icon: "alert-circle", ink: "dangerText" },
};

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  message: string;
  /** An action under the message — usually a ghost Button. */
  children?: ReactNode;
  testID?: string;
}

/**
 * A message across a screen: a form's failure, a notice, a warning. The tone shows in
 * the icon and its colour, never in a saturated fill — the paint keeps the colour.
 */
export function Banner({ tone = "info", title, message, children, testID }: BannerProps) {
  const { colors, radius } = useTheme();
  const { icon, ink } = look[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === "danger" ? "alert" : "summary"}
      accessibilityLiveRegion="polite"
      style={[
        styles.box,
        { borderRadius: radius.md, backgroundColor: colors.surface, borderColor: colors.ruleStrong },
      ]}
    >
      <Feather name={icon} size={18} color={colors[ink]} style={styles.icon} />
      <View style={styles.body}>
        {title ? <Text variant="bodyStrong">{title}</Text> : null}
        <Text variant="small" tone={tone === "danger" ? "danger" : "soft"}>
          {message}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: 12, padding: 14, borderWidth: hairline },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 6 },
});
