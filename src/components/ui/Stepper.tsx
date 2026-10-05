import { StyleSheet, View } from "react-native";

import { hairline, useTheme } from "@/theme";

import { IconButton } from "./IconButton";
import { Text } from "./Text";

export interface StepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** What one of them is called, for the screen reader: "3 rooms". */
  describe: (value: number) => string;
  /** "One fewer" / "One more", said before the thing's name. */
  fewerLabel: string;
  moreLabel: string;
  disabled?: boolean;
  testID?: string;
}

/** − n + — a count to buy (C28). Adjustable for screen readers, like a slider. */
export function Stepper({ value, min = 0, max, onChange, describe, fewerLabel, moreLabel, disabled, testID }: StepperProps) {
  const { colors, radius } = useTheme();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <View
      style={[styles.box, { borderColor: colors.ruleStrong, borderRadius: radius.pill }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={describe(value)}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => !disabled && set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      testID={testID}
    >
      <IconButton icon="minus" label={fewerLabel} onPress={() => set(value - 1)} disabled={disabled || value <= min} testID={testID && `${testID}-less`} />
      <Text variant="bodyStrong" style={styles.value}>
        {value}
      </Text>
      <IconButton icon="plus" label={moreLabel} onPress={() => set(value + 1)} disabled={disabled || value >= max} testID={testID && `${testID}-more`} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", borderWidth: hairline, alignSelf: "flex-start" },
  value: { minWidth: 28, textAlign: "center" },
});
