import { Switch as RNSwitch, StyleSheet, View } from "react-native";

import { useTheme } from "@/theme";

import { Text } from "./Text";

export interface SwitchProps {
  label: string;
  /** What being on or off means, under the label. */
  note?: string | null;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * A labelled on/off row (docs/02 `Switch`): the label and its note on the left, the switch
 * on the right, brass when on — as the studio's walls list draws it. The whole row is one
 * switch to a screen reader.
 */
export function Switch({ label, note, value, onValueChange, disabled, testID }: SwitchProps) {
  const { colors, space } = useTheme();
  return (
    <View style={[styles.row, { gap: space.md, opacity: disabled && !value ? 0.55 : 1 }]}>
      <View style={[styles.fill, { gap: 2 }]}>
        <Text variant="painterStrong">{label}</Text>
        {note ? (
          <Text variant="small" tone="soft">
            {note}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled), checked: value }}
        accessibilityHint={note ?? undefined}
        trackColor={{ true: colors.accent, false: colors.ruleStrong }}
        thumbColor={colors.ivory}
        {...{ activeThumbColor: colors.ivory }}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  fill: { flex: 1 },
});
