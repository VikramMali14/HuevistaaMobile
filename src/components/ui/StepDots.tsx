import { ActivityIndicator, StyleSheet, View } from "react-native";

import { t, type MessageKey } from "@/i18n";
import { useTheme } from "@/theme";

import { Text } from "./Text";

/** The studio's five steps, in order (docs/04 "The studio — one room, five steps"). */
export const STUDIO_STEPS = ["photo", "tidy", "walls", "adjust", "paint"] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

/**
 * Where this room is in the studio: five dots, only the current one labelled. A step the
 * server is still working on shows a spinner in place of its dot.
 */
export function StepDots({ current, working = false }: { current: StudioStep; working?: boolean }) {
  const { colors } = useTheme();
  const index = STUDIO_STEPS.indexOf(current);
  const label = t(`steps.${current}` as MessageKey);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("steps.label", { n: index + 1, total: STUDIO_STEPS.length, step: label })}
      accessibilityValue={{ min: 1, max: STUDIO_STEPS.length, now: index + 1 }}
    >
      {STUDIO_STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        if (active && working) return <ActivityIndicator key={step} size="small" color={colors.accentText} style={styles.spin} />;
        return (
          <View
            key={step}
            style={[
              styles.dot,
              active ? styles.active : null,
              { backgroundColor: done || active ? colors.accentText : "transparent", borderColor: done || active ? colors.accentText : colors.ruleStrong },
            ]}
          />
        );
      })}
      <Text variant="small" tone="soft" style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  active: { width: 20 },
  spin: { width: 20, height: 16, transform: [{ scale: 0.7 }] },
  label: { marginLeft: 6, flexShrink: 1 },
});
