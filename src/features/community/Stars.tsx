import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { starLabel } from "./review";

/**
 * Five stars to choose a rating from (C26, D1) — the website's StarInput: a set of five
 * choices read as one ("3 stars — Okay, selected"), with the word for the chosen one
 * under them.
 */
export function StarInput({ value, onChange, error, disabled }: { value: number; onChange: (n: number) => void; error?: string | null; disabled?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="fieldLabel">{t("review.rating")}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t("review.rating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={`${n === 1 ? t("review.oneStar") : t("review.nStars", { n })} — ${starLabel(n)}`}
            accessibilityState={{ checked: value === n, disabled }}
            hitSlop={4}
            style={styles.star}
            testID={`star-${n}`}
          >
            <Text style={[styles.glyph, { color: n <= value ? colors.accentText : colors.fgMute }]}>{n <= value ? "★" : "☆"}</Text>
          </Pressable>
        ))}
      </View>
      <Text variant="small" tone={error && !value ? "danger" : "soft"} accessibilityLiveRegion="polite">
        {error && !value ? error : starLabel(value)}
      </Text>
    </View>
  );
}

/** A rating shown: filled stars, read as "4 out of 5 stars". */
export function Stars({ rating, size = 18 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  const whole = Math.round(rating);
  return (
    <Text accessibilityLabel={t("review.outOfFive", { n: rating })} style={{ fontSize: size, lineHeight: size * 1.2, letterSpacing: 2 }}>
      <Text style={{ color: colors.accentText, fontSize: size }}>{"★".repeat(whole)}</Text>
      <Text style={{ color: colors.fgMute, fontSize: size }}>{"☆".repeat(5 - whole)}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  star: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  glyph: { fontSize: 34, lineHeight: 40 },
});
