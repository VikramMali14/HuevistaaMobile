import { StyleSheet, View } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

/** "Priya Sharma" → "PS". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** A person's initials in a circle. */
export function Avatar({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSoft, borderColor: colors.ruleBrass },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: size * 0.38, color: colors.accentText }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", borderWidth: hairline },
});
