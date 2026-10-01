import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, View } from "react-native";

import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

import { Text } from "./Text";

/**
 * The two fixed disclaimers, word for word (docs/01-product.md rule 2). They get real
 * space on screen — never fine print.
 *
 * - `shades` on anything showing shades
 * - `ai` on anything AI-generated
 */
export function Disclaimer({ kind }: { kind: "shades" | "ai" }) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={[
        styles.box,
        { borderColor: colors.rule, borderRadius: radius.md, padding: space.md, backgroundColor: colors.surface },
      ]}
      accessibilityRole="text"
    >
      <Feather name="info" size={16} color={colors.fgMute} style={styles.icon} />
      <Text variant="small" tone="soft" style={styles.text}>
        {t(kind === "shades" ? "disclaimer.shades" : "disclaimer.ai")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: 10, borderWidth: hairline },
  icon: { marginTop: 2 },
  text: { flex: 1 },
});
